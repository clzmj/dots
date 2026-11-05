import { describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Command, CommandRunner } from "../src/lib/process";
import { Platform } from "../src/packages";
import { setupNoSleep } from "../src/nosleep";

function recordingRunner(
  respond: (command: Command) => { exitCode: number; stdout?: string; stderr?: string },
) {
  const commands: Command[] = [];
  const runner: CommandRunner = {
    async run(command) {
      commands.push(command);
      const result = respond(command);
      return {
        command,
        exitCode: result.exitCode,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        durationMs: 0,
      };
    },
  };
  return { runner, commands };
}

const options = (
  runner: CommandRunner,
  overrides: Partial<Parameters<typeof setupNoSleep>[0]> = {},
) => ({
  platform: Platform.Darwin,
  runner,
  env: {},
  dryRun: false,
  interactive: false,
  log: () => {},
  ...overrides,
});

async function installScript(): Promise<string> {
  const { runner, commands } = recordingRunner((command) =>
    command[0] === "id" ? { exitCode: 0, stdout: "carlos\n" } : { exitCode: 0 },
  );
  await setupNoSleep(options(runner));
  return commands[2]?.[4] ?? "";
}

async function runInstaller(script: string, root: string, failFinalValidation = false) {
  const directory = join(root, "etc/sudoers.d");
  const stub = join(root, "visudo");
  await mkdir(directory, { recursive: true });
  await writeFile(stub, '#!/bin/sh\n[ "$1" != "-c" ] || [ "${FAIL_FINAL_VALIDATION:-}" != "1" ]\n');
  await chmod(stub, 0o755);
  const sandboxed = script
    .replaceAll("/private/etc/sudoers.d", directory)
    .replaceAll("/usr/sbin/chown", "/usr/bin/true")
    .replaceAll("/usr/sbin/visudo", stub);
  return Bun.spawnSync({
    cmd: ["/bin/sh", "-c", sandboxed, "--", "carlos"],
    env: { ...process.env, FAIL_FINAL_VALIDATION: failFinalValidation ? "1" : "" },
    stdout: "pipe",
    stderr: "pipe",
  });
}

describe("passwordless no-sleep setup", () => {
  test("does nothing on Linux", async () => {
    const { runner, commands } = recordingRunner(() => ({ exitCode: 0, stdout: "carlos\n" }));

    await setupNoSleep(options(runner, { platform: Platform.Debian }));

    expect(commands).toEqual([]);
  });

  test("dry-run identifies the user and logs the plan without invoking sudo", async () => {
    const { runner, commands } = recordingRunner(() => ({ exitCode: 0, stdout: "carlos\n" }));
    const messages: string[] = [];

    await setupNoSleep(options(runner, { dryRun: true, log: (message) => messages.push(message) }));

    expect(commands).toEqual([["id", "-un"]]);
    expect(messages.join("\n")).toContain("carlos");
    expect(commands.some(([executable]) => executable === "sudo")).toBe(false);
  });

  test("rejects unsafe usernames before any privileged command", async () => {
    const { runner, commands } = recordingRunner(() => ({
      exitCode: 0,
      stdout: "carlos; touch /tmp/pwned\n",
    }));

    await expect(setupNoSleep(options(runner))).rejects.toThrow();

    expect(commands).toEqual([["id", "-un"]]);
  });

  test("reports failed identity lookup without attempting installation", async () => {
    const { runner, commands } = recordingRunner(() => ({ exitCode: 1, stderr: "id failed" }));

    await expect(setupNoSleep(options(runner))).rejects.toThrow();

    expect(commands).toEqual([["id", "-un"]]);
  });

  test("non-interactive setup stops when passwordless sudo is unavailable", async () => {
    const { runner, commands } = recordingRunner((command) => {
      if (command[0] === "id") return { exitCode: 0, stdout: "carlos\n" };
      return { exitCode: 1, stderr: "a password is required" };
    });

    await expect(setupNoSleep(options(runner))).rejects.toThrow();

    expect(commands.map(([executable]) => executable)).toEqual(["id", "sudo"]);
    expect(commands[1]).toEqual(["sudo", "-n", "-v"]);
  });

  test("uses the validated user as a separate argument to the limited installer", async () => {
    const { runner, commands } = recordingRunner((command) => {
      if (command[0] === "id") return { exitCode: 0, stdout: "carlos\n" };
      return { exitCode: 0 };
    });

    await setupNoSleep(options(runner));

    expect(commands[0]).toEqual(["id", "-un"]);
    expect(commands[1]).toEqual(["sudo", "-n", "-v"]);
    expect(commands[2]?.slice(0, 5)).toEqual(["sudo", "-n", "/bin/sh", "-c", expect.any(String)]);
    expect(commands[2]?.slice(-2)).toEqual(["--", "carlos"]);
  });

  test("uses the macOS administrator prompt when interactive sudo authorization is needed", async () => {
    const { runner, commands } = recordingRunner((command) => {
      if (command[0] === "id") return { exitCode: 0, stdout: "carlos\n" };
      if (command[0] === "sudo") return { exitCode: 1, stderr: "a password is required" };
      return { exitCode: 0 };
    });

    await setupNoSleep(options(runner, { interactive: true }));

    expect(commands.map(([executable]) => executable)).toEqual([
      "id",
      "sudo",
      "/usr/bin/osascript",
    ]);
    expect(commands[2]?.[1]).toBe("-e");
    expect(commands[2]?.[2]).toContain("with administrator privileges");
  });

  test("does not prompt interactively after an installer failure", async () => {
    const { runner, commands } = recordingRunner((command) => {
      if (command[0] === "id") return { exitCode: 0, stdout: "carlos\n" };
      if (command[0] === "sudo" && command[2] === "-v") return { exitCode: 0 };
      if (command[0] === "sudo") return { exitCode: 1, stderr: "installer failed" };
      return { exitCode: 0 };
    });

    await expect(setupNoSleep(options(runner, { interactive: true }))).rejects.toThrow();

    expect(commands.some(([executable]) => executable === "/usr/bin/osascript")).toBe(false);
  });

  test("runs the captured installer safely in a temporary sudoers sandbox", async () => {
    const script = await installScript();
    const root = await mkdtemp(join(tmpdir(), "dots-nosleep-installer-"));
    try {
      const destination = join(root, "etc/sudoers.d/nosleep");
      const first = await runInstaller(script, root);
      expect(first.exitCode).toBe(0);
      expect(await readFile(destination, "utf8")).toBe(
        "# Passwordless access only for the nosleep toggle.\ncarlos ALL=(root) NOPASSWD: /usr/bin/pmset disablesleep 0, /usr/bin/pmset disablesleep 1\n",
      );
      expect((await stat(destination)).mode & 0o777).toBe(0o440);
      if (process.platform === "darwin") {
        const syntax = Bun.spawnSync({
          cmd: ["/usr/sbin/visudo", "-cf", destination],
          stdout: "pipe",
          stderr: "pipe",
        });
        expect(syntax.exitCode).toBe(0);
      }
      const installedAt = (await stat(destination)).mtimeMs;

      const second = await runInstaller(script, root);
      expect(second.exitCode).toBe(0);
      expect((await stat(destination)).mtimeMs).toBe(installedAt);
      const directory = join(root, "etc/sudoers.d");
      expect((await readdir(directory)).some((name) => name.startsWith(".nosleep."))).toBe(false);

      await chmod(destination, 0o600);
      await writeFile(destination, "conflicting rule\n");
      const conflict = await runInstaller(script, root);
      expect(conflict.exitCode).not.toBe(0);
      expect(await readFile(destination, "utf8")).toBe("conflicting rule\n");
      expect((await readdir(directory)).some((name) => name.startsWith(".nosleep."))).toBe(false);

      const rollbackRoot = await mkdtemp(join(tmpdir(), "dots-nosleep-rollback-"));
      try {
        const rollback = await runInstaller(script, rollbackRoot, true);
        expect(rollback.exitCode).not.toBe(0);
        const rollbackDirectory = join(rollbackRoot, "etc/sudoers.d");
        expect((await readdir(rollbackDirectory)).includes("nosleep")).toBe(false);
        expect(
          (await readdir(rollbackDirectory)).some((name) => name.startsWith(".nosleep.")),
        ).toBe(false);
      } finally {
        await rm(rollbackRoot, { recursive: true, force: true });
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test.skipIf(process.platform !== "darwin")(
    "compiles the interactive AppleScript without running it",
    async () => {
      const { runner, commands } = recordingRunner((command) => {
        if (command[0] === "id") return { exitCode: 0, stdout: "carlos\n" };
        if (command[0] === "sudo") return { exitCode: 1, stderr: "a password is required" };
        return { exitCode: 0 };
      });
      await setupNoSleep(options(runner, { interactive: true }));
      const source = commands[2]?.[2] ?? "";
      expect(source).toContain("with administrator privileges");

      const root = await mkdtemp(join(tmpdir(), "dots-nosleep-applescript-"));
      try {
        const sourcePath = join(root, "installer.applescript");
        await writeFile(sourcePath, source);
        const compiled = Bun.spawnSync({
          cmd: ["/usr/bin/osacompile", "-o", join(root, "installer.scpt"), sourcePath],
          stdout: "pipe",
          stderr: "pipe",
        });
        expect(compiled.exitCode).toBe(0);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );
});
