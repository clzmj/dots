import { describe, expect, test } from "bun:test";

import { parseCli, parseDuration, runCommand } from "../src/cli";
import {
  formatDuration,
  osc777,
  runAndNotify,
  type CommandRuntime,
  type Notifier,
} from "../src/runner";

class FakeRuntime implements CommandRuntime {
  clock = 100;
  status = 0;
  thrown: Error | undefined;
  received: readonly string[] = [];

  async spawn(command: readonly string[]): Promise<number> {
    this.received = command;
    this.clock += 65_900;
    if (this.thrown) throw this.thrown;
    return this.status;
  }

  now(): number {
    return this.clock;
  }
}

function captureNotifications() {
  const calls: Array<{ title: string; message: string }> = [];
  const notifier: Notifier = async (title, message) => {
    calls.push({ title, message });
    return true;
  };
  return { calls, notifier };
}

describe("formatting", () => {
  test("formats duration boundaries", () => {
    expect(formatDuration(-1)).toBe("0s");
    expect(formatDuration(999)).toBe("0s");
    expect(formatDuration(60_000)).toBe("1m 0s");
    expect(formatDuration(7_501_000)).toBe("2h 5m");
  });

  test("builds OSC 777 and strips field delimiters and control characters", () => {
    expect(osc777("build;\u0007bad", "done\u001b;now")).toBe(
      "\u001b]777;notify;build  bad;done  now\u0007",
    );
  });
});

describe("argument parsing", () => {
  test("supports legacy commands and an explicit option boundary", () => {
    expect(parseCli(["printf", "%s", "hello"])).toMatchObject({
      kind: "run",
      command: ["printf", "%s", "hello"],
    });
    expect(parseCli(["--on", "failure", "--after", "1.5m", "--", "-command"])).toEqual({
      kind: "run",
      command: ["-command"],
      condition: "failure",
      afterMs: 90_000,
      title: undefined,
      alwaysZero: false,
    });
  });

  test("validates options and durations", () => {
    expect(parseDuration("250ms")).toBe(250);
    expect(parseDuration("2s")).toBe(2_000);
    expect(parseDuration("1h")).toBe(3_600_000);
    expect(() => parseCli(["--unknown"])).toThrow("unknown option");
    expect(() => parseCli(["--on", "sometimes", "echo"])).toThrow("--on requires");
    expect(() => parseCli([])).toThrow("command is required");
  });
});

describe("command execution", () => {
  test("preserves exact arguments and reports success", async () => {
    const runtime = new FakeRuntime();
    const notifications = captureNotifications();
    const result = await runAndNotify(
      ["/usr/bin/build-tool", "argument with spaces", "--flag"],
      {},
      runtime,
      notifications.notifier,
    );
    expect(runtime.received).toEqual(["/usr/bin/build-tool", "argument with spaces", "--flag"]);
    expect(result).toEqual({ status: 0, durationMs: 65_900, notified: true, error: null });
    expect(notifications.calls).toEqual([
      { title: "build-tool", message: "✅ Succeeded after 1m 5s" },
    ]);
  });

  test("reports child failure and supports notification filters", async () => {
    const runtime = new FakeRuntime();
    runtime.status = 9;
    const notifications = captureNotifications();
    const result = await runAndNotify(
      ["fails"],
      { condition: "success" },
      runtime,
      notifications.notifier,
    );
    expect(result.status).toBe(9);
    expect(result.notified).toBe(false);
    expect(notifications.calls).toEqual([]);
  });

  test("honors the minimum duration and custom title", async () => {
    const runtime = new FakeRuntime();
    const notifications = captureNotifications();
    const skipped = await runAndNotify(
      ["build"],
      { afterMs: 70_000 },
      runtime,
      notifications.notifier,
    );
    expect(skipped.notified).toBe(false);

    const secondRuntime = new FakeRuntime();
    await runAndNotify(["build"], { title: "Workspace" }, secondRuntime, notifications.notifier);
    expect(notifications.calls[0]?.title).toBe("Workspace");
  });

  test("uses status 127 when spawning fails and still notifies", async () => {
    const runtime = new FakeRuntime();
    runtime.thrown = new Error("executable not found");
    const notifications = captureNotifications();
    const result = await runAndNotify(["missing"], {}, runtime, notifications.notifier);
    expect(result.status).toBe(127);
    expect(result.error).toBe("executable not found");
    expect(notifications.calls[0]?.message).toContain("status: 127");
  });
});

describe("CLI", () => {
  test("propagates status by default and offers explicit compatibility mode", async () => {
    const runtime = new FakeRuntime();
    runtime.status = 17;
    expect(
      await runCommand(["fails"], { runtime, notifier: async () => true, error: () => {} }),
    ).toBe(17);

    const compatibilityRuntime = new FakeRuntime();
    compatibilityRuntime.status = 17;
    expect(
      await runCommand(["--always-zero", "fails"], {
        runtime: compatibilityRuntime,
        notifier: async () => true,
      }),
    ).toBe(0);
  });

  test("returns usage status for invalid invocation", async () => {
    const errors: string[] = [];
    expect(await runCommand([], { error: (line) => errors.push(line) })).toBe(2);
    expect(errors.join("\n")).toContain("command is required");
  });
});
