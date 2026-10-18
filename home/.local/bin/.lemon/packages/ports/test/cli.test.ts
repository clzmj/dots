import { CliOption, ProcessIO } from "../../../shared/tokens.ts";
import { expect, test } from "bun:test";
import { join } from "node:path";

import pkg from "../package.json";

const cli = join(import.meta.dir, "../src/cli.ts");

async function invoke(...args: string[]) {
  const child = Bun.spawn([process.execPath, cli, ...args], {
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

test("--help documents the command model", async () => {
  const result = await invoke(CliOption.Help);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("lemon ports list");
  expect(result.stdout).toContain("lemon ports stop");
});

test("--version uses the package version", async () => {
  const result = await invoke(CliOption.Version);
  expect(result.status).toBe(0);
  expect(result.stdout.trim()).toBe(pkg.version);
});

test("invalid commands exit with usage status", async () => {
  const result = await invoke("unknown");
  expect(result.status).toBe(2);
  expect(result.stderr).toContain("unknown command");
});
