import { describe, expect, test } from "bun:test";
import {
  chmod,
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
import { findStaleLinks, setup, type Prompt } from "../src/setup";

class FixedPrompt implements Prompt {
  readonly interactive: boolean;
  constructor(
    private readonly confirmed: boolean,
    interactive = false,
  ) {
    this.interactive = interactive;
  }
  ask(_question: string, defaultValue: string): string {
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
  return { root, dots, home };
}

const quiet = { log: () => {}, warn: () => {} };

describe("setup", () => {
  test("links dotfiles, writes identity, and caches answers idempotently", async () => {
    const item = await fixture();
    try {
      const options = {
        ...item,
        platform: "debian" as const,
        skipPackages: true,
        env: { DOTS_YES: "1", DOTS_NAME: "Ada Lovelace", DOTS_EMAIL: "ada@example.org" },
        prompt: new FixedPrompt(true),
        ...quiet,
      };
      const first = await setup(options);
      expect(await readlink(join(item.home, ".zshrc"))).toBe(join(item.dots, "home/.zshrc"));
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
      expect(await readlink(join(item.home, ".zshrc"))).toBe(join(item.dots, "home/.zshrc"));
      expect(result.backup).toBeDefined();
      if (!result.backup) throw new Error("expected setup to create a backup");
      expect(await readFile(join(result.backup, ".zshrc"), "utf8")).toBe("mine\n");
      expect(existsSync(join(item.home, ".gitconfig"))).toBe(false);
    } finally {
      await rm(item.root, { recursive: true, force: true });
    }
  });

  test("declining preserves conflicts but links everything else", async () => {
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
      expect(await readlink(join(item.home, ".config/zsh/shell.zsh"))).toBe(
        join(item.dots, "home/.config/zsh/shell.zsh"),
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
      expect(result.linked).toBeGreaterThan(0);
      expect(existsSync(join(item.home, ".zshrc"))).toBe(false);
      expect(existsSync(join(item.home, ".config/dots/answers"))).toBe(false);
      expect(lines.some((line) => line.includes("[plan] link ~/.zshrc"))).toBe(true);
    } finally {
      await rm(item.root, { recursive: true, force: true });
    }
  });

  test("links config but rejects when package installation is incomplete", async () => {
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
            stdout: `user:x:1000:1000::/home/user:${process.env.SHELL || "/bin/zsh"}\n`,
            stderr: "",
            durationMs: 0,
          }),
        },
        ...quiet,
      });
      await expect(promise).rejects.toThrow("setup is incomplete");
      expect(await readlink(join(item.home, ".zshrc"))).toBe(join(item.dots, "home/.zshrc"));
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
        PATH: `${fakeBin}:${process.env.PATH}`,
        HOME: join(root, "fake-home"),
        FAKE_BUN_LOG: log,
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
