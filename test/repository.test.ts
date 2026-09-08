import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
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

test("zsh exposes homologous user tool paths to non-interactive commands", async () => {
  const parent = await mkdtemp(join(tmpdir(), "dots-zshenv-test-"));
  const home = join(parent, "home");
  try {
    await mkdir(home);
    await symlink(join(root, "home/.zshenv"), join(home, ".zshenv"));
    const child = Bun.spawn(["zsh", "-c", "print -rl -- $path"], {
      env: { HOME: home, ZDOTDIR: home, PATH: "/usr/bin:/bin" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, status] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(status, stderr).toBe(0);
    const paths = stdout.trim().split("\n");
    for (const relative of [".local/bin", ".bun/bin", ".cargo/bin", ".opencode/bin", "go/bin"])
      expect(paths).toContain(join(home, relative));
    expect(paths).toContain("/usr/local/go/bin");
    expect(paths).toContain("/usr/local/bin");
    if (process.platform === "darwin") expect(paths).toContain("/opt/homebrew/bin");
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
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
