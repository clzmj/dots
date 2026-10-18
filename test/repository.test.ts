import {
  EnvironmentKey,
  Executable,
  FilePattern,
  RepositoryPath,
  ShellFlag,
  StreamMode,
  SystemPath,
  UserPath,
} from "../src/lib/tokens";
import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OperatingSystem } from "../src/packages";

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
    expect(existsSync(join(root, RepositoryPath.HomeBin, command))).toBe(false);
  }
});

test("Lemon is installed through the mirrored local bin", async () => {
  const lemon = join(root, RepositoryPath.Lemon);
  expect(existsSync(lemon)).toBe(true);
  expect((await Bun.file(lemon).text()).startsWith("#!/usr/bin/env bun\n")).toBe(true);
});

test("zsh exposes homologous user tool paths to non-interactive commands", async () => {
  const parent = await mkdtemp(join(tmpdir(), "dots-zshenv-test-"));
  const home = join(parent, RepositoryPath.Home);
  try {
    await mkdir(home);
    await symlink(join(root, RepositoryPath.HomeZshenv), join(home, UserPath.Zshenv));
    const child = Bun.spawn([Executable.Zsh, ShellFlag.Command, "print -rl -- $path"], {
      env: {
        [EnvironmentKey.Home]: home,
        [EnvironmentKey.Zdotdir]: home,
        [EnvironmentKey.Path]: "/usr/bin:/bin",
      },
      stdout: StreamMode.Pipe,
      stderr: StreamMode.Pipe,
    });
    const [stdout, stderr, status] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(status, stderr).toBe(0);
    const paths = stdout.trim().split("\n");
    for (const relative of [
      UserPath.LocalBin,
      UserPath.BunBin,
      UserPath.CargoBin,
      UserPath.OpencodeBin,
      UserPath.GoBin,
    ])
      expect(paths).toContain(join(home, relative));
    expect(paths).toContain(SystemPath.GoBin);
    expect(paths).toContain("/usr/local/bin");
    if (process.platform === OperatingSystem.Darwin) expect(paths).toContain("/opt/homebrew/bin");
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("the repository has no machine-specific absolute home path", async () => {
  const offenders: string[] = [];
  const machineHome = ["", "Users", "carlos"].join("/");
  for await (const relative of new Bun.Glob(FilePattern.Recursive).scan({
    cwd: root,
    dot: true,
    onlyFiles: true,
  })) {
    if (relative.startsWith(RepositoryPath.GitDirectory)) continue;
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
