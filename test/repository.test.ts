import { expect, test } from "bun:test";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const bin = join(root, "home/.local/bin");

test("every installed helper is an executable Bun command", async () => {
  const commands: string[] = [];
  for await (const name of new Bun.Glob("*").scan({ cwd: bin, onlyFiles: true })) {
    commands.push(name);
    const path = join(bin, name);
    const [contents, metadata] = await Promise.all([readFile(path, "utf8"), stat(path)]);
    expect(contents.split("\n", 1)[0]).toBe("#!/usr/bin/env bun");
    expect(metadata.mode & 0o111).not.toBe(0);
  }
  expect(commands.sort()).toEqual([
    "blame-menu",
    "kserver",
    "machine-report",
    "notify",
    "open",
    "pbcopy",
    "pbpaste",
    "tree",
    "www",
  ]);
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
