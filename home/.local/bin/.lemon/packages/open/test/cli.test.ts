import { CliOption, Executable, ProcessIO } from "../../../shared/tokens";
import { describe, expect, test } from "bun:test";
import { dirname, join } from "node:path";

import pkg from "../package.json";
import { runOpen } from "../src/cli.ts";

const root = dirname(import.meta.dir);
const cli = join(root, "src/cli.ts");

async function run(args: readonly string[]) {
  const child = Bun.spawn([Executable.Bun, cli, ...args], {
    stdout: ProcessIO.Pipe,
    stderr: ProcessIO.Pipe,
  });
  const [stdout, stderr, status] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, status };
}

describe("open CLI", () => {
  test("shows help with no arguments and --help", async () => {
    for (const args of [[], [CliOption.Help]]) {
      const result = await run(args);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Usage:");
      expect(result.stdout).toContain("lemon open [--] TARGET...");
    }
  });

  test("prints its version", async () => {
    const result = await run([CliOption.Version]);
    expect(result).toMatchObject({ status: 0, stdout: `${pkg.version}\n`, stderr: "" });
  });

  test("rejects unknown options", async () => {
    const result = await run(["--bogus"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("unknown option: --bogus");
  });

  test("requires a target after the option separator", async () => {
    const errors: string[] = [];
    const status = await runOpen([CliOption.Separator], {
      out: () => {},
      error: (message) => errors.push(message),
    });
    expect(status).toBe(2);
    expect(errors[0]).toContain("at least one target");
  });
});
