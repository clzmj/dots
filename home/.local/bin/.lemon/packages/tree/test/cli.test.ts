import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { defaultIgnores, ezaCommand, parseArgs } from "../src/cli";

const temporary: string[] = [];
afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("arguments", () => {
  test("uses and extends default exclusions", () => {
    const parsed = parseArgs(["--ignore", "coverage", "--level", "2"]);
    expect(parsed).toMatchObject({ action: "run", ezaArgs: ["--level", "2"] });
    if (parsed.action !== "run") throw new Error("unexpected action");
    expect(parsed.ignores).toEqual([...defaultIgnores, "coverage"]);
    expect(ezaCommand(parsed).join(" ")).toContain("node_modules|target|venv|coverage");
  });

  test("can disable default exclusions", () => {
    expect(parseArgs(["--no-default-ignore", "--ignore=.cache", "."])).toEqual({
      action: "run",
      ignores: [".cache"],
      ezaArgs: ["."],
    });
  });

  test("rejects an incomplete wrapper option", () => {
    expect(() => parseArgs(["--ignore"])).toThrow("requires a glob");
  });
});

test("help and version succeed", async () => {
  for (const option of ["--help", "--version"]) {
    const child = Bun.spawn(["bun", "src/cli.ts", option], { cwd: import.meta.dir + "/.." });
    expect(await child.exited).toBe(0);
  }
});

test("streams eza output and preserves its status", async () => {
  const bin = mkdtempSync(join(tmpdir(), "lemonaid-tree-"));
  temporary.push(bin);
  const eza = join(bin, "eza");
  await Bun.write(eza, "#!/bin/sh\nprintf 'mock-eza:%s\\n' \"$*\"\nexit 23\n");
  chmodSync(eza, 0o755);
  const child = Bun.spawn(["bun", "src/cli.ts", "demo"], {
    cwd: import.meta.dir + "/..",
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    stdout: "pipe",
  });
  expect(await new Response(child.stdout).text()).toContain(
    "mock-eza:--tree --all --git --ignore-glob",
  );
  expect(await child.exited).toBe(23);
});
