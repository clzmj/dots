import { describe, expect, test } from "bun:test";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import type { CommandRunner } from "../src/lib/process";
import { InstallMode, findStaleLinks, setup, type Prompt } from "../src/setup";

class FixedPrompt implements Prompt {
  readonly interactive: boolean;
  constructor(
    private readonly confirmed: boolean,
    interactive = false,
    private readonly modeAnswers: string[] = [],
  ) {
    this.interactive = interactive;
  }
  ask(question: string, defaultValue: string): string {
    if (question.includes("copy or symlink")) return this.modeAnswers.shift() ?? defaultValue;
    return defaultValue;
  }
  confirm(): boolean {
    return this.confirmed;
  }
  close(): void {}
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "dots-setup-test-"));
  const dots = join(root, "dots");
  const home = join(root, "home");
  await mkdir(join(dots, "home/.config/zsh"), { recursive: true });
  await writeFile(join(dots, "home/.zshrc"), "source config\n");
  await writeFile(join(dots, "home/.config/zsh/shell.zsh"), "alias hi=hello\n");
  await mkdir(home, { recursive: true });
  return { root, dots, home, runner: loginShellRunner(home) };
}

function loginShellRunner(home: string): CommandRunner {
  const shell = Bun.which("zsh") ?? "/bin/zsh";
  return {
    async run(command) {
      const stdout =
        command[0] === "id"
          ? `user:*:501:20::0:0:User:${home}:${shell}\n`
          : `user:x:1000:1000::${home}:${shell}\n`;
      return { command, exitCode: 0, stdout, stderr: "", durationMs: 0 };
    },
  };
}

const quiet = { log: () => {}, warn: () => {} };

describe("setup", () => {
  test("defaults to independent copies, writes identity, and reruns idempotently", async () => {
    const item = await fixture();
    try {
      const options = {
        ...item,
        platform: "debian",
        skipPackages: true,
        env: {
          ["DOTS_YES"]: "1",
          ["DOTS_INSTALL_MODE"]: undefined,
          ["DOTS_NAME"]: "Ada Lovelace",
          ["DOTS_EMAIL"]: "ada@example.org",
        },
        prompt: new FixedPrompt(true),
        ...quiet,
      };
      const first = await setup(options);
      expect((await lstat(join(item.home, ".zshrc"))).isFile()).toBe(true);
      expect(await readFile(join(item.home, ".zshrc"), "utf8")).toBe("source config\n");
      expect(first.copied).toBe(2);
      expect(first.linked).toBe(0);
      expect(await readFile(join(item.home, ".config/git/local"), "utf8")).toContain(
        "ada@example.org",
      );
      expect(
        (await readFile(join(item.home, ".config/dots/answers"), "utf8")).trim().split("\n"),
      ).toHaveLength(2);
      expect(first.conflicts).toHaveLength(0);
      const second = await setup(options);
      expect(second.conflicts).toHaveLength(0);
      expect(second.backup).toBeUndefined();
      expect(second.copied).toBe(0);
      await writeFile(join(item.home, ".zshrc"), "local edit\n");
      expect(await readFile(join(item.dots, "home/.zshrc"), "utf8")).toBe("source config\n");
    } finally {
      await rm(item.root, { recursive: true, force: true });
    }
  });

  test("backs up all conflicts after one accepted confirmation", async () => {
    const item = await fixture();
    try {
      await writeFile(join(item.home, ".zshrc"), "mine\n");
      await writeFile(join(item.home, ".gitconfig"), "[user]\nname=Old\n");
      const result = await setup({
        ...item,
        platform: "debian",
        skipPackages: true,
        prompt: new FixedPrompt(true, true),
        ...quiet,
      });
      expect(result.conflicts).toEqual(expect.arrayContaining([".zshrc", ".gitconfig"]));
      expect((await lstat(join(item.home, ".zshrc"))).isFile()).toBe(true);
      expect(await readFile(join(item.home, ".zshrc"), "utf8")).toBe("source config\n");
      expect(result.backup).toBeDefined();
      if (!result.backup) throw new Error("expected setup to create a backup");
      expect(await readFile(join(result.backup, ".zshrc"), "utf8")).toBe("mine\n");
      expect(existsSync(join(item.home, ".gitconfig"))).toBe(false);
    } finally {
      await rm(item.root, { recursive: true, force: true });
    }
  });

  test("declining preserves conflicts but copies everything else", async () => {
    const item = await fixture();
    try {
      await writeFile(join(item.home, ".zshrc"), "mine\n");
      const result = await setup({
        ...item,
        platform: "debian",
        skipPackages: true,
        prompt: new FixedPrompt(false),
        ...quiet,
      });
      expect(await readFile(join(item.home, ".zshrc"), "utf8")).toBe("mine\n");
      expect(await readFile(join(item.home, ".config/zsh/shell.zsh"), "utf8")).toBe(
        "alias hi=hello\n",
      );
      expect(result.backup).toBeUndefined();
    } finally {
      await rm(item.root, { recursive: true, force: true });
    }
  });

  test("finds and prunes only stale links into this checkout", async () => {
    const item = await fixture();
    try {
      await mkdir(join(item.home, ".config/zsh"), { recursive: true });
      const stale = join(item.home, ".config/zsh/gone.zsh");
      const foreign = join(item.home, ".config/foreign");
      await symlink(join(item.dots, "home/.config/zsh/gone.zsh"), stale);
      await symlink("/definitely/not/dots", foreign);
      expect(await findStaleLinks(item.home, item.dots)).toEqual([stale]);
      await setup({
        ...item,
        platform: "debian",
        skipPackages: true,
        prompt: new FixedPrompt(true),
        ...quiet,
      });
      expect(existsSync(stale)).toBe(false);
      expect(await readlink(foreign)).toBe("/definitely/not/dots");
    } finally {
      await rm(item.root, { recursive: true, force: true });
    }
  });

  test("dry-run reports work without creating files", async () => {
    const item = await fixture();
    try {
      const lines: string[] = [];
      const result = await setup({
        ...item,
        platform: "debian",
        skipPackages: true,
        dryRun: true,
        prompt: new FixedPrompt(true),
        log: (line) => lines.push(line),
        warn: () => {},
      });
      expect(result.copied).toBeGreaterThan(0);
      expect(existsSync(join(item.home, ".zshrc"))).toBe(false);
      expect(existsSync(join(item.home, ".config/dots/answers"))).toBe(false);
      expect(lines.some((line) => line.includes("[plan] copy ~/.zshrc"))).toBe(true);
    } finally {
      await rm(item.root, { recursive: true, force: true });
    }
  });

  test("copies config but rejects when package installation is incomplete", async () => {
    const item = await fixture();
    try {
      const promise = setup({
        ...item,
        platform: "debian",
        prompt: new FixedPrompt(true),
        packageInstaller: async () => ({
          planned: [],
          installed: [],
          skipped: [],
          failures: [{ name: "native debian", error: new Error("offline") }],
        }),
        runner: {
          run: async (command) => ({
            command,
            exitCode: 0,
            stdout: `user:x:1000:1000::/home/user:${process.env["SHELL"] || "/bin/zsh"}\n`,
            stderr: "",
            durationMs: 0,
          }),
        },
        ...quiet,
      });
      await expect(promise).rejects.toThrow("setup is incomplete");
      expect((await lstat(join(item.home, ".zshrc"))).isFile()).toBe(true);
    } finally {
      await rm(item.root, { recursive: true, force: true });
    }
  });

  test("rejects a complete package install when zsh cannot become the login shell", async () => {
    const item = await fixture();
    const shell = process.platform === "darwin" ? "/bin/zsh" : "/usr/bin/zsh";
    try {
      const runner = {
        run: async (command: readonly [string, ...string[]]) => ({
          command,
          exitCode: command[0] === "getent" ? 0 : 1,
          stdout: command[0] === "getent" ? `user:x:1000:1000::${item.home}:/bin/bash\n` : "",
          stderr: "permission denied",
          durationMs: 0,
        }),
      };
      const promise = setup({
        ...item,
        platform: "debian",
        env: {
          ["PATH"]: `${shell.slice(0, shell.lastIndexOf("/"))}:/usr/bin:/bin`,
          ["USER"]: "user",
        },
        prompt: new FixedPrompt(true),
        packageInstaller: async () => ({ planned: [], installed: [], skipped: [], failures: [] }),
        runner,
        ...quiet,
      });
      await expect(promise).rejects.toThrow("could not set login shell to");
    } finally {
      await rm(item.root, { recursive: true, force: true });
    }
  });

  test.each(Object.values(InstallMode))(
    "installs Lemon using %s as a runnable Bun command",
    async (mode) => {
      const root = await mkdtemp(join(tmpdir(), "dots-lemon-setup-test-"));
      const dots = resolve(import.meta.dir, "..");
      const home = join(root, "home");
      try {
        await mkdir(home);
        await setup({
          dots,
          home,
          platform: "darwin",
          skipPackages: true,
          env: {
            ["DOTS_YES"]: "1",
            ["DOTS_INSTALL_MODE"]: mode,
          },
          runner: loginShellRunner(home),
          prompt: new FixedPrompt(true),
          ...quiet,
        });
        const lemon = join(home, ".local/bin/lemon");
        expect((await lstat(lemon)).isSymbolicLink()).toBe(mode === InstallMode.Symlink);
        if (mode === InstallMode.Symlink)
          expect(await readlink(lemon)).toBe(join(dots, "home/.local/bin/lemon"));
        const result = Bun.spawnSync([lemon, "--version"], {
          env: { ...process.env, ["HOME"]: home },
          stdout: "pipe",
        });
        expect(result.exitCode).toBe(0);
        expect(new TextDecoder().decode(result.stdout).trim()).toBe("0.1.0");
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  test.each([
    ["", InstallMode.Copy],
    [InstallMode.Symlink, InstallMode.Symlink],
    ["invalid", InstallMode.Symlink],
  ])("interactive choice %s resolves to %s", async (answer, expected) => {
    const item = await fixture();
    try {
      const warnings: string[] = [];
      const result = await setup({
        ...item,
        platform: "debian",
        skipPackages: true,
        env: { ["DOTS_YES"]: undefined, ["DOTS_INSTALL_MODE"]: undefined },
        prompt: new FixedPrompt(true, true, [answer, InstallMode.Symlink]),
        ...quiet,
        warn: (line) => warnings.push(line),
      });
      expect((await lstat(join(item.home, ".zshrc"))).isSymbolicLink()).toBe(
        expected === InstallMode.Symlink,
      );
      expect(result.linked).toBe(expected === InstallMode.Symlink ? 2 : 0);
      if (answer === "invalid")
        expect(warnings).toContain("choose copy or symlink (press Enter for copy)");
    } finally {
      await rm(item.root, { recursive: true, force: true });
    }
  });

  test.each(Object.values(InstallMode))(
    "switches from %s with backups and preserves conflicts when declined",
    async (mode) => {
      const item = await fixture();
      try {
        const options = {
          ...item,
          platform: "debian",
          skipPackages: true,
          prompt: new FixedPrompt(true),
          ...quiet,
        };
        await setup({
          ...options,
          env: {
            ["DOTS_YES"]: "1",
            ["DOTS_INSTALL_MODE"]: mode,
          },
        });
        const repeat = await setup({
          ...options,
          env: {
            ["DOTS_YES"]: "1",
            ["DOTS_INSTALL_MODE"]: mode,
          },
        });
        expect(repeat.conflicts).toHaveLength(0);
        const nextMode = mode === InstallMode.Copy ? InstallMode.Symlink : InstallMode.Copy;
        const env = {
          ["DOTS_YES"]: undefined,
          ["DOTS_INSTALL_MODE"]: nextMode,
        };
        const declined = await setup({ ...options, env, prompt: new FixedPrompt(false) });
        expect(declined.backup).toBeUndefined();
        expect((await lstat(join(item.home, ".zshrc"))).isSymbolicLink()).toBe(
          mode === InstallMode.Symlink,
        );
        const accepted = await setup({ ...options, env });
        expect(accepted.backup).toBeDefined();
        if (!accepted.backup) throw new Error("expected mode switch backup");
        expect((await lstat(join(accepted.backup, ".zshrc"))).isSymbolicLink()).toBe(
          mode === InstallMode.Symlink,
        );
        expect((await lstat(join(item.home, ".zshrc"))).isSymbolicLink()).toBe(
          nextMode === InstallMode.Symlink,
        );
        expect(await readFile(join(item.dots, "home/.zshrc"), "utf8")).toBe("source config\n");
      } finally {
        await rm(item.root, { recursive: true, force: true });
      }
    },
  );

  test("rejects invalid unattended mode before writing configuration", async () => {
    const item = await fixture();
    try {
      await expect(
        setup({
          ...item,
          platform: "debian",
          skipPackages: true,
          env: { ["DOTS_INSTALL_MODE"]: "invalid" },
          prompt: new FixedPrompt(true),
          ...quiet,
        }),
      ).rejects.toThrow("invalid DOTS_INSTALL_MODE");
      expect(existsSync(join(item.home, ".config/dots/answers"))).toBe(false);
    } finally {
      await rm(item.root, { recursive: true, force: true });
    }
  });
});

test("POSIX bootstrap accepts Bun 1.4 and execs with --no-orphans", async () => {
  const root = await mkdtemp(join(tmpdir(), "dots-bootstrap-test-"));
  const sourceSetup = resolve(import.meta.dir, "../setup.sh");
  const bootstrap = join(root, "setup.sh");
  const fakeBin = join(root, "bin");
  const log = join(root, "bun.log");
  try {
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(join(root, "home"), { recursive: true });
    await Bun.write(bootstrap, Bun.file(sourceSetup));
    await writeFile(join(root, "src/setup.ts"), "// marker\n");
    await mkdir(fakeBin);
    await writeFile(
      join(fakeBin, "bun"),
      `#!/bin/sh\nif [ "$1" = --version ]; then echo 1.4.0; exit; fi\nprintf '%s\\n' "$*" > "$FAKE_BUN_LOG"\n`,
    );
    await chmod(join(fakeBin, "bun"), 0o755);
    const result = Bun.spawnSync(["sh", bootstrap], {
      env: {
        ...process.env,
        ["PATH"]: `${fakeBin}:${process.env["PATH"]}`,
        ["HOME"]: join(root, "fake-home"),
        ["FAKE_BUN_LOG"]: log,
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(result.exitCode).toBe(0);
    expect(await readFile(log, "utf8")).toContain(`--no-orphans ${join(root, "src/setup.ts")}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
