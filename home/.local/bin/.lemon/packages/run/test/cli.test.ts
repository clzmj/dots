import { expect, test } from "bun:test";
import { join } from "node:path";

import pkg from "../package.json";

const cli = join(import.meta.dir, "../src/cli.ts");

async function invoke(...args: string[]) {
  const child = Bun.spawn([process.execPath, cli, ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, status] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, status };
}

test("--help and --version are CLI controls", async () => {
  const help = await invoke("--help");
  expect(help.status).toBe(0);
  expect(help.stdout).toContain("lemon run [options] -- <command>");

  const version = await invoke("--version");
  expect(version.status).toBe(0);
  expect(version.stdout.trim()).toBe(pkg.version);
});

test("invocation streams output and preserves failure status", async () => {
  const result = await invoke(
    process.execPath,
    "-e",
    "console.log('child-output'); console.error('child-error'); process.exit(9)",
  );
  expect(result.status).toBe(9);
  expect(result.stdout).toContain("child-output");
  expect(result.stderr).toContain("child-error");
  expect(result.stdout).not.toContain("]777;");
});

test("--always-zero keeps the historical wrapper status", async () => {
  const result = await invoke("--always-zero", "--", process.execPath, "-e", "process.exit(23)");
  expect(result.status).toBe(0);
});

test("invalid options exit with usage status", async () => {
  const result = await invoke("--wat");
  expect(result.status).toBe(2);
  expect(result.stderr).toContain("unknown option");
});
