import { describe, expect, test } from "bun:test";
import { dirname, join } from "node:path";

import pkg from "../package.json";

const cli = join(dirname(import.meta.dir), "src/cli.ts");

async function run(args: readonly string[]) {
  const child = Bun.spawn(["bun", cli, ...args], {
    stdout: "pipe",
    stderr: "pipe",
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
    for (const args of [[], ["--help"], ["open", "--help"], ["blame", "--help"]]) {
      const result = await run(args);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Usage:");
      expect(result.stdout).toContain("lemon repo");
    }
  });

  test("prints the module version", async () => {
    expect(await run(["--version"])).toMatchObject({
      status: 0,
      stdout: `${pkg.version}\n`,
      stderr: "",
    });
  });

  test("rejects invalid commands", async () => {
    const result = await run(["unknown"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("lemon repo: unknown command");
  });
});
