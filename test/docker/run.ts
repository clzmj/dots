import {
  CliFlag,
  CommandVerb,
  EnvironmentKey,
  EnvironmentValue,
  Executable,
  RepositoryPath,
  ShellFlag,
  StreamMode,
  TextEncoding,
  UserPath,
} from "../../src/lib/tokens";
import { lstat, mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { detectPlatform, installPackages, Platform } from "../../src/packages";

import { InstallMode } from "../../src/setup";

const root = resolve(import.meta.dir, "../..");
const override = process.env[EnvironmentKey.DockerPlatform];
const expected = ([Platform.Debian, Platform.Fedora, Platform.Arch] as const).find(
  (value) => value === override,
);

if (expected === undefined) {
  throw new Error(`invalid ${EnvironmentKey.DockerPlatform}: ${override ?? "unset"}`);
}

const detected = detectPlatform();
if (detected !== expected) {
  throw new Error(`detected ${detected}, expected ${expected}`);
}

const plan = await installPackages({
  platform: detected,
  home: "/tmp/dots-plan-home",
  dryRun: true,
  exists: () => false,
  log: () => {},
  warn: () => {},
});
const manager = {
  [Platform.Debian]: Executable.AptGet,
  [Platform.Fedora]: Executable.Dnf,
  [Platform.Arch]: Executable.Pacman,
}[expected];
if (!plan.planned.some((entry) => entry.includes(manager))) {
  throw new Error(`${expected} dry-run did not plan ${manager}:\n${plan.planned.join("\n")}`);
}

const home = await mkdtemp(join(tmpdir(), `dots-${expected}-`));
try {
  await Promise.all([
    run([Executable.Sh, ShellFlag.SyntaxCheck, RepositoryPath.Bootstrap]),
    run([Executable.Dash, ShellFlag.SyntaxCheck, RepositoryPath.Bootstrap]),
    run([Executable.Bun, CommandVerb.Test, CliFlag.Parallel, CliFlag.Isolate]),
    run([Executable.Sh, RepositoryPath.Bootstrap], {
      [EnvironmentKey.Home]: home,
      [EnvironmentKey.Dots]: root,
      [EnvironmentKey.SkipPackages]: EnvironmentValue.Enabled,
      [EnvironmentKey.AssumeYes]: EnvironmentValue.Enabled,
      [EnvironmentKey.InstallMode]: InstallMode.Copy,
      [EnvironmentKey.Name]: "Container Test",
      [EnvironmentKey.Email]: `${expected}@example.invalid`,
    }),
  ]);

  const zshrc = join(home, UserPath.Zshrc);
  if (!(await lstat(zshrc)).isFile()) throw new Error("setup did not copy ~/.zshrc");
  if (
    (await readFile(zshrc, TextEncoding.Utf8)) !==
    (await readFile(join(root, RepositoryPath.HomeZshrc), TextEncoding.Utf8))
  ) {
    throw new Error("setup copied ~/.zshrc from the wrong checkout");
  }
  const identity = await readFile(join(home, UserPath.GitIdentity), TextEncoding.Utf8);
  if (!identity.includes(`${expected}@example.invalid`)) {
    throw new Error("setup did not write the container identity");
  }
  console.log(`container integration passed: ${expected}`);
} finally {
  await rm(home, { recursive: true, force: true });
}

async function run(
  command: readonly [string, ...string[]],
  env?: Record<string, string>,
): Promise<void> {
  const child = Bun.spawn([...command], {
    cwd: root,
    env: { ...process.env, ...env },
    stdin: StreamMode.Ignore,
    stdout: StreamMode.Inherit,
    stderr: StreamMode.Inherit,
  });
  const code = await child.exited;
  if (code !== 0) throw new Error(`${command.join(" ")} exited ${code}`);
}
