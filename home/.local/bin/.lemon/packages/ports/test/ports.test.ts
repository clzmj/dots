import { describe, expect, test } from "bun:test";

import { parseCli, parseDuration, runPorts } from "../src/cli";
import {
  discoverServers,
  isDevelopmentServer,
  parseLsof,
  parseSelection,
  stopServers,
  type CommandResult,
  type ProcessSignal,
  type Server,
  type SystemAdapter,
} from "../src/ports";

const LISTENERS = [
  "p4002",
  "cpython3",
  "n[::1]:8000",
  "p4001",
  "cnode",
  "n*:3000",
  "n127.0.0.1:3000",
  "p4003",
  "csshd",
  "n*:22",
  "",
].join("\n");

class FakeSystem implements SystemAdapter {
  lsof = LISTENERS;
  lsofExitCode = 0;
  lsofError = "";
  hasLsof = true;
  clock = 0;
  commands = new Map([
    [4001, "node /workspace/api.ts"],
    [4002, "python3 -m http.server 8000"],
    [4003, "/usr/sbin/sshd -D"],
  ]);
  alive = new Map([
    [4001, true],
    [4002, true],
    [4003, true],
  ]);
  termExits = new Set<number>();
  killExits = new Set([4001, 4002, 4003]);
  signals: Array<[number, ProcessSignal]> = [];

  which(): string | null {
    return this.hasLsof ? "/mock/lsof" : null;
  }

  async run(command: readonly string[]): Promise<CommandResult> {
    if (command[0] === "lsof") {
      return { exitCode: this.lsofExitCode, stdout: this.lsof, stderr: this.lsofError };
    }
    const pid = Number(command[2]);
    const value = this.commands.get(pid);
    return value === undefined
      ? { exitCode: 1, stdout: "", stderr: "gone" }
      : { exitCode: 0, stdout: `${value}\n`, stderr: "" };
  }

  signal(pid: number, signal: ProcessSignal): boolean {
    this.signals.push([pid, signal]);
    if (this.alive.get(pid) !== true) return false;
    if (signal === "SIGTERM" && this.termExits.has(pid)) this.alive.set(pid, false);
    if (signal === "SIGKILL" && this.killExits.has(pid)) this.alive.set(pid, false);
    return true;
  }

  async sleep(milliseconds: number): Promise<void> {
    this.clock += milliseconds;
  }

  now(): number {
    return this.clock;
  }
}

describe("listener discovery", () => {
  test("parses IPv4 and IPv6 lsof records and deduplicates ports", () => {
    expect(parseLsof(LISTENERS)).toEqual([
      { pid: 4002, name: "python3", ports: [8000] },
      { pid: 4001, name: "node", ports: [3000] },
      { pid: 4003, name: "sshd", ports: [22] },
    ]);
    expect(parseLsof("pnope\ncnode\nn*:0\np5\ncnode\nn*:70000\n")).toEqual([
      { pid: 5, name: "node", ports: [] },
    ]);
  });

  test("classifies exact runtimes and command patterns without matching generic main", () => {
    expect(isDevelopmentServer("node", "node api.ts")).toBe(true);
    expect(isDevelopmentServer("python-worker", "python-worker")).toBe(true);
    expect(isDevelopmentServer("launcher", "bun run dev")).toBe(true);
    expect(isDevelopmentServer("main", "/usr/bin/main")).toBe(false);
    expect(isDevelopmentServer("sshd", "/usr/sbin/sshd -D")).toBe(false);
  });

  test("returns filtered, deterministic results and can include every listener", async () => {
    const system = new FakeSystem();
    expect((await discoverServers(system)).map(({ pid }) => pid)).toEqual([4001, 4002]);
    expect((await discoverServers(system, true)).map(({ pid }) => pid)).toEqual([4003, 4001, 4002]);
  });

  test("reports missing and failed lsof instead of pretending there are no servers", async () => {
    const missing = new FakeSystem();
    missing.hasLsof = false;
    await expect(discoverServers(missing)).rejects.toThrow("lsof is required");

    const failed = new FakeSystem();
    failed.lsofExitCode = 3;
    failed.lsofError = "permission denied";
    await expect(discoverServers(failed)).rejects.toThrow("lsof failed with status 3");
  });

  test("accepts lsof's no-match status when it produced no diagnostic", async () => {
    const system = new FakeSystem();
    system.lsof = "";
    system.lsofExitCode = 1;
    await expect(discoverServers(system)).resolves.toEqual([]);
  });
});

describe("selection and argument parsing", () => {
  test("accepts multi-selection, ranges, duplicate values, and all", () => {
    expect(parseSelection("1, 3-4, 3", 4)).toEqual([0, 2, 3]);
    expect(parseSelection("all", 3)).toEqual([0, 1, 2]);
    expect(() => parseSelection("0", 3)).toThrow("out of range");
    expect(() => parseSelection("3-1", 3)).toThrow("invalid range");
    expect(() => parseSelection("", 3)).toThrow("empty selection");
  });

  test("parses list and stop options", () => {
    expect(parseCli([])).toEqual({
      kind: "list",
      json: false,
      includeAll: false,
      verbose: false,
    });
    expect(parseCli(["list", "--json", "--all"])).toEqual({
      kind: "list",
      json: true,
      includeAll: true,
      verbose: false,
    });
    expect(parseCli(["stop", "--port", "3000", "--port", "3000", "-y", "--timeout", "2s"])).toEqual(
      {
        kind: "stop",
        ports: [3000],
        all: false,
        yes: true,
        timeoutMs: 2000,
        killAfterTimeout: true,
      },
    );
    expect(() => parseCli(["stop", "--port", "0"])).toThrow("between 1 and 65535");
    expect(() => parseCli(["stop", "--all", "--port", "3000"])).toThrow("either");
    expect(parseDuration("250ms")).toBe(250);
    expect(parseDuration("1.5s")).toBe(1500);
  });
});

describe("safe stopping", () => {
  const target: Server = {
    pid: 4001,
    name: "node",
    ports: [3000],
    command: "node /workspace/api.ts",
  };

  test("records a clean SIGTERM exit", async () => {
    const system = new FakeSystem();
    system.termExits.add(4001);
    const result = await stopServers([target], system, { timeoutMs: 100 });
    expect(result).toEqual({ terminated: [4001], killed: [], stale: [], failed: [] });
    expect(system.signals).toContainEqual([4001, "SIGTERM"]);
    expect(system.signals.some(([, signal]) => signal === "SIGKILL")).toBe(false);
  });

  test("escalates a survivor and verifies it exited", async () => {
    const system = new FakeSystem();
    const result = await stopServers([target], system, { timeoutMs: 0 });
    expect(result).toEqual({ terminated: [], killed: [4001], stale: [], failed: [] });
    expect(system.signals).toContainEqual([4001, "SIGKILL"]);
  });

  test("reports survivors when escalation is disabled", async () => {
    const system = new FakeSystem();
    const result = await stopServers([target], system, {
      timeoutMs: 0,
      killAfterTimeout: false,
    });
    expect(result.failed).toEqual([{ pid: 4001, error: "still running after SIGTERM timeout" }]);
  });

  test("refuses a PID whose identity changed before signaling", async () => {
    const system = new FakeSystem();
    const result = await stopServers([{ ...target, command: "node old.ts" }], system, {
      timeoutMs: 0,
    });
    expect(result.stale).toEqual([4001]);
    expect(system.signals).toEqual([]);
  });

  test("refuses unsafe PIDs before discovery or signaling", async () => {
    const system = new FakeSystem();
    await expect(stopServers([{ ...target, pid: 1 }], system)).rejects.toThrow("unsafe PID");
    expect(system.signals).toEqual([]);
  });
});

describe("CLI", () => {
  test("uses safe list behavior with no arguments", async () => {
    const lines: string[] = [];
    const status = await runPorts([], {
      system: new FakeSystem(),
      log: (line) => lines.push(line),
    });
    expect(status).toBe(0);
    expect(lines.join("\n")).toContain("node /workspace/api.ts");
  });

  test("lists JSON and handles invalid commands", async () => {
    const lines: string[] = [];
    expect(
      await runPorts(["list", "--json"], {
        system: new FakeSystem(),
        log: (line) => lines.push(line),
      }),
    ).toBe(0);
    expect(JSON.parse(lines[0] ?? "[]")[0].ports).toEqual([3000]);

    const errors: string[] = [];
    expect(await runPorts(["wat"], { error: (line) => errors.push(line) })).toBe(2);
    expect(errors.join("\n")).toContain("unknown command");
  });
});
