import { RepoCommand } from "../src/tokens.ts";
import { CliOption, ProcessIO, Executable } from "../../../shared/tokens.ts";
import { describe, expect, test } from "bun:test";
import { dirname, join } from "node:path";

import pkg from "../package.json";

const cli = join(dirname(import.meta.dir), "src/cli.ts");

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

describe("repo command contracts", () => {
  test("shows top-level and subcommand help", async () => {
    for (const args of [[CliOption.Help], [RepoCommand.Blame, CliOption.Help]]) {
      const result = await run(args);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Usage:");
      expect(result.stdout).toContain("lemon repo");
    }
  });

  test("prints the module version", async () => {
    expect(await run([CliOption.Version])).toMatchObject({
      status: 0,
      stdout: `${pkg.version}\n`,
      stderr: "",
    });
  });

  test("treats the first positional argument as a repository path", async () => {
    const result = await run(["unknown"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("lemon repo: path does not exist");
  });
});
