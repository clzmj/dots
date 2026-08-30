import { describe, expect, test } from "bun:test";
import {
  BunCommandRunner,
  CommandError,
  runChecked,
  runParallel,
  runSerial,
} from "../src/lib/process";

describe("process orchestration", () => {
  test("captures stdout and stderr", async () => {
    const result = await new BunCommandRunner().run([
      "sh",
      "-c",
      "printf output; printf warning >&2",
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("output");
    expect(result.stderr).toBe("warning");
  });

  test("a fast command does not inherit its long timeout", async () => {
    const started = performance.now();
    await new BunCommandRunner().run(["sh", "-c", "exit 0"], { timeoutMs: 10_000 });
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  test("timeout kills descendants that keep captured pipes open", async () => {
    const started = performance.now();
    const result = await new BunCommandRunner().run(["sh", "-c", "sleep 3 & wait"], {
      timeoutMs: 100,
    });
    expect(result.exitCode).not.toBe(0);
    expect(performance.now() - started).toBeLessThan(1_500);
  });

  test("runChecked reports the command failure", async () => {
    await expect(
      runChecked(new BunCommandRunner(), ["sh", "-c", "echo bad >&2; exit 7"]),
    ).rejects.toBeInstanceOf(CommandError);
  });

  test("serial tasks never overlap", async () => {
    let active = 0;
    let maximum = 0;
    const task = (name: string) => ({
      name,
      run: async () => {
        active++;
        maximum = Math.max(maximum, active);
        await Bun.sleep(15);
        active--;
      },
    });
    const result = await runSerial([task("one"), task("two"), task("three")]);
    expect(maximum).toBe(1);
    expect(result.completed).toEqual(["one", "two", "three"]);
  });

  test("parallel tasks overlap and aggregate failures", async () => {
    let active = 0;
    let maximum = 0;
    const result = await runParallel([
      {
        name: "one",
        run: async () => {
          active++;
          maximum = Math.max(maximum, active);
          await Bun.sleep(20);
          active--;
        },
      },
      {
        name: "two",
        run: async () => {
          active++;
          maximum = Math.max(maximum, active);
          await Bun.sleep(5);
          active--;
          throw new Error("two failed");
        },
      },
    ]);
    expect(maximum).toBe(2);
    expect(result.completed).toEqual(["one"]);
    expect(result.failed.map((failure) => failure.name)).toEqual(["two"]);
  });
});
