import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

test("legacy CLI helpers are no longer vendored", () => {
  const commands = [
    "blame-menu",
    "kserver",
    "machine-report",
    "notify",
    "open",
    "pbcopy",
    "pbpaste",
    "tree",
    "www",
  ];
  for (const command of commands) {
    expect(existsSync(join(root, "home/.local/bin", command))).toBe(false);
  }
});

test("Lemon is installed through the mirrored local bin", async () => {
  const lemon = join(root, "home/.local/bin/lemon");
  expect(existsSync(lemon)).toBe(true);
  expect((await Bun.file(lemon).text()).startsWith("#!/usr/bin/env bun\n")).toBe(true);
});

test("the repository has no machine-specific absolute home path", async () => {
  const offenders: string[] = [];
  const machineHome = ["", "Users", "carlos"].join("/");
  for await (const relative of new Bun.Glob("**/*").scan({
    cwd: root,
    dot: true,
    onlyFiles: true,
  })) {
    if (relative.startsWith(".git/")) continue;
    const file = Bun.file(join(root, relative));
    if ((await file.text()).includes(machineHome)) offenders.push(relative);
  }
  expect(offenders).toEqual([]);
});

test("Bun 1.4 runtime APIs required by the scripts exist", () => {
  expect(Bun.semver.satisfies(Bun.version, ">=1.4.0")).toBe(true);
  expect(typeof Bun.Archive).toBe("function");
  expect(typeof Bun.Glob).toBe("function");
  expect(typeof Bun.stringWidth).toBe("function");
  expect(typeof Bun.sliceAnsi).toBe("function");
});
