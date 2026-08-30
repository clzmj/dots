import { lstat, mkdtemp, readFile, readlink, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { detectPlatform, installPackages, type Platform } from "../../src/packages";

const root = resolve(import.meta.dir, "../..");
const expected = process.env.DOTS_DOCKER_PLATFORM as Platform | undefined;

if (!expected || !(["debian", "fedora", "arch"] as const).includes(expected as never)) {
  throw new Error(`invalid DOTS_DOCKER_PLATFORM: ${expected ?? "unset"}`);
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
const manager = { debian: "apt-get", fedora: "dnf", arch: "pacman" }[expected];
if (!plan.planned.some((entry) => entry.includes(manager))) {
  throw new Error(`${expected} dry-run did not plan ${manager}:\n${plan.planned.join("\n")}`);
}

const home = await mkdtemp(join(tmpdir(), `dots-${expected}-`));
try {
  await Promise.all([
    run(["sh", "-n", "setup.sh"]),
    run(["dash", "-n", "setup.sh"]),
    run(["bun", "test", "--parallel", "--isolate"]),
    run(["sh", "setup.sh"], {
      HOME: home,
      DOTS: root,
      DOTS_SKIP_PACKAGES: "1",
      DOTS_YES: "1",
      DOTS_NAME: "Container Test",
      DOTS_EMAIL: `${expected}@example.invalid`,
    }),
  ]);

  const zshrc = join(home, ".zshrc");
  if (!(await lstat(zshrc)).isSymbolicLink()) throw new Error("setup did not link ~/.zshrc");
  if ((await readlink(zshrc)) !== join(root, "home/.zshrc")) {
    throw new Error("setup linked ~/.zshrc to the wrong checkout");
  }
  const identity = await readFile(join(home, ".config/git/local"), "utf8");
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
  const child = Bun.spawn(command, {
    cwd: root,
    env: { ...process.env, ...env },
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await child.exited;
  if (code !== 0) throw new Error(`${command.join(" ")} exited ${code}`);
}
