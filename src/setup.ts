import {
  closeSync,
  constants,
  existsSync,
  openSync,
  readFileSync,
  readSync,
  type Dirent,
  writeSync,
} from "node:fs";
import {
  lstat,
  mkdir,
  readFile,
  readlink,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { BunCommandRunner, type Command, type CommandRunner } from "./lib/process";
import {
  installPackages,
  platformFromEnvironment,
  type PackageReport,
  type Platform,
} from "./packages";

const GREEN = "\x1b[1;32m==>\x1b[0m";
const YELLOW = "\x1b[1;33m==>\x1b[0m";

export type SetupPlanEntry =
  | { mode: "link"; source: string; destination: string }
  | { mode: "write"; destination: string };

export interface SetupOptions {
  dots: string;
  home: string;
  platform: Platform;
  env?: Record<string, string | undefined>;
  dryRun?: boolean;
  skipPackages?: boolean;
  runner?: CommandRunner;
  prompt?: Prompt;
  log?: (message: string) => void;
  warn?: (message: string) => void;
  packageInstaller?: (options: Parameters<typeof installPackages>[0]) => Promise<PackageReport>;
}

export interface SetupResult {
  conflicts: string[];
  backup?: string;
  linked: number;
  pruned: string[];
}

export interface Prompt {
  readonly interactive: boolean;
  ask(question: string, defaultValue: string): string;
  confirm(question: string): boolean;
  close(): void;
}

class TtyPrompt implements Prompt {
  readonly interactive: boolean;
  private descriptor?: number;

  constructor(assumeYes: boolean) {
    if (assumeYes) {
      this.interactive = false;
      return;
    }
    try {
      this.descriptor = openSync("/dev/tty", constants.O_RDWR);
      this.interactive = true;
    } catch {
      this.interactive = false;
    }
  }

  ask(question: string, defaultValue: string): string {
    if (!this.interactive || this.descriptor === undefined) return defaultValue;
    writeSync(this.descriptor, `  ${question} [${defaultValue}]: `);
    return this.readLine() || defaultValue;
  }

  confirm(question: string): boolean {
    if (!this.interactive || this.descriptor === undefined) return false;
    writeSync(this.descriptor, `  ${question} [y/N]: `);
    return /^(y|yes)$/i.test(this.readLine());
  }

  private readLine(): string {
    if (this.descriptor === undefined) return "";
    const bytes: number[] = [];
    const byte = Buffer.allocUnsafe(1);
    while (readSync(this.descriptor, byte, 0, 1, null) === 1) {
      const value = byte[0];
      if (value === undefined || value === 10 || value === 13) break;
      bytes.push(value);
    }
    return Buffer.from(bytes).toString("utf8").trim();
  }

  close(): void {
    if (this.descriptor !== undefined) closeSync(this.descriptor);
  }
}

export async function buildSetupPlan(dots: string, home: string): Promise<SetupPlanEntry[]> {
  const sourceRoot = join(dots, "home");
  const entries: SetupPlanEntry[] = [];
  const glob = new Bun.Glob("**/*");
  for await (const path of glob.scan({ cwd: sourceRoot, dot: true, onlyFiles: true })) {
    entries.push({ mode: "link", source: join(sourceRoot, path), destination: join(home, path) });
  }
  entries.sort((left, right) => left.destination.localeCompare(right.destination));
  entries.push({ mode: "write", destination: join(home, ".config/git/local") });
  return entries;
}

export async function findConflicts(
  plan: readonly SetupPlanEntry[],
  home: string,
): Promise<string[]> {
  const conflicts: string[] = [];
  for (const entry of plan) {
    if (!(await pathExists(entry.destination))) continue;
    if (entry.mode === "write") continue;
    if (await isExactLink(entry.destination, entry.source)) continue;
    conflicts.push(relative(home, entry.destination));
  }
  const legacyGit = join(home, ".gitconfig");
  try {
    const stat = await lstat(legacyGit);
    if (stat.isFile() && !stat.isSymbolicLink()) conflicts.push(".gitconfig");
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  return conflicts;
}

export async function setup(options: SetupOptions): Promise<SetupResult> {
  const dots = resolve(options.dots);
  const home = resolve(options.home);
  const env = { ...process.env, ...options.env, HOME: home };
  const dryRun = options.dryRun ?? false;
  const skipPackages = options.skipPackages ?? env.DOTS_SKIP_PACKAGES === "1";
  const assumeYes = env.DOTS_YES === "1";
  const prompt = options.prompt ?? new TtyPrompt(assumeYes);
  const runner = options.runner ?? new BunCommandRunner();
  const log = options.log ?? ((message) => console.log(`${GREEN} ${message}`));
  const warn = options.warn ?? ((message) => console.error(`${YELLOW} ${message}`));
  const timestamp = formatTimestamp(new Date());
  const backup = join(home, ".dots-backup", timestamp);
  let packageFailures = 0;

  try {
    log(
      `${options.platform === "darwin" ? "darwin" : "linux"} detected${prompt.interactive ? "" : " (non-interactive)"}`,
    );
    log("configuration");
    const answersFile = join(home, ".config/dots/answers");
    const cached = await readAnswers(answersFile);
    const name = resolveAnswer(
      "NAME",
      "Full name (git commits)",
      "Carlos Lezama",
      env,
      cached,
      prompt,
    );
    const email = resolveAnswer(
      "EMAIL",
      "Email (git commits)",
      "carlos@example.com",
      env,
      cached,
      prompt,
    );
    if (!dryRun) await writeAnswers(answersFile, { NAME: name, EMAIL: email });

    if (skipPackages)
      warn("DOTS_SKIP_PACKAGES=1 — skipping optional packages (Bun remains required)");
    else {
      const packageReport = await (options.packageInstaller ?? installPackages)({
        platform: options.platform,
        home,
        runner,
        dryRun,
        env,
        log,
        warn,
      });
      packageFailures = packageReport.failures.length;
      if (packageFailures > 0)
        warn(`${packageFailures} package group(s) failed; linking config before reporting failure`);
      if (dryRun)
        packageReport.planned.forEach((line) => {
          log(`[plan] ${line}`);
        });
    }

    const plan = await buildSetupPlan(dots, home);
    const conflicts = await findConflicts(plan, home);
    let overwrite = true;
    if (conflicts.length > 0) {
      warn(
        `you already have these files:\n${conflicts.map((path) => `      ~/${path}`).join("\n")}`,
      );
      overwrite =
        assumeYes ||
        prompt.confirm("Replace them with the dots config? (originals move to ~/.dots-backup)");
      if (!overwrite) warn("keeping your versions — everything else still gets linked");
    }

    const pruned = dryRun
      ? await findStaleLinks(home, dots)
      : await pruneStaleLinks(home, dots, warn);
    if (dryRun)
      pruned.forEach((path) => {
        log(`[plan] prune stale link ~/${relative(home, path)}`);
      });

    log("linking config");
    let linked = 0;
    for (const entry of plan) {
      if (entry.mode === "link" && (await isExactLink(entry.destination, entry.source))) continue;
      const relativeDestination = relative(home, entry.destination);
      if ((await pathExists(entry.destination)) && conflicts.includes(relativeDestination)) {
        if (!overwrite) continue;
        if (dryRun) log(`[plan] backup ~/${relativeDestination}`);
        else await stash(entry.destination, backup, home);
      }
      if (dryRun) {
        log(`[plan] ${entry.mode} ~/${relativeDestination}`);
        linked++;
        continue;
      }
      await mkdir(dirname(entry.destination), { recursive: true });
      if (entry.mode === "link") {
        await rm(entry.destination, { force: true, recursive: false });
        await symlink(entry.source, entry.destination);
        linked++;
      } else if (!(await pathExists(entry.destination))) {
        await writeFile(entry.destination, `[user]\n\tname = ${name}\n\temail = ${email}\n`);
      }
    }

    const legacyGit = join(home, ".gitconfig");
    if (overwrite && conflicts.includes(".gitconfig")) {
      if (dryRun) log("[plan] backup ~/.gitconfig");
      else {
        await stash(legacyGit, backup, home);
        warn("moved ~/.gitconfig aside (it would shadow ~/.config/git/config)");
      }
    }

    if (!skipPackages) await ensureLoginShell(options.platform, runner, env, dryRun, log, warn);
    if (!dryRun && existsSync(backup)) log(`replaced files are in ${backup}`);
    if (!dryRun && packageFailures > 0) {
      throw new Error(
        `${packageFailures} package group(s) failed; config linking completed but setup is incomplete`,
      );
    }
    log(dryRun ? "dry-run complete" : "done — open a new shell");
    return {
      conflicts,
      backup: !dryRun && existsSync(backup) ? backup : undefined,
      linked,
      pruned,
    };
  } finally {
    prompt.close();
  }
}

function resolveAnswer(
  key: string,
  question: string,
  defaultValue: string,
  env: Record<string, string | undefined>,
  cached: Map<string, string>,
  prompt: Prompt,
): string {
  return (
    env[`DOTS_${key}`] || cached.get(key) || prompt.ask(question, defaultValue) || defaultValue
  );
}

export async function readAnswers(path: string): Promise<Map<string, string>> {
  const answers = new Map<string, string>();
  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if (isMissing(error)) return answers;
    throw error;
  }
  for (const line of content.split("\n")) {
    const separator = line.indexOf("=");
    if (separator > 0) answers.set(line.slice(0, separator), line.slice(separator + 1));
  }
  return answers;
}

async function writeAnswers(path: string, answers: Record<string, string>): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const safe = Object.entries(answers)
    .map(([key, value]) => `${key}=${value.replace(/[\r\n]/g, " ")}`)
    .join("\n");
  await Bun.write(path, `${safe}\n`);
}

async function stash(path: string, backup: string, home: string): Promise<void> {
  const destination = join(backup, relative(home, path));
  await mkdir(dirname(destination), { recursive: true });
  await rename(path, destination);
}

export async function findStaleLinks(home: string, dots: string, maxDepth = 5): Promise<string[]> {
  const links: string[] = [];
  await walk(home, 0);
  return links;

  async function walk(directory: string, depth: number): Promise<void> {
    if (depth >= maxDepth) return;
    let entries: Dirent[];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        try {
          const target = await readlink(path);
          const absolute = target.startsWith(sep) ? target : resolve(dirname(path), target);
          if (isInside(absolute, dots) && !existsSync(path)) links.push(path);
        } catch {
          // Raced with another process removing the link.
        }
      } else if (entry.isDirectory()) {
        await walk(path, depth + 1);
      }
    }
  }
}

async function pruneStaleLinks(
  home: string,
  dots: string,
  warn: (message: string) => void,
): Promise<string[]> {
  const links = await findStaleLinks(home, dots);
  for (const link of links) {
    await rm(link, { force: true });
    warn(`pruned stale link ${relative(home, link)}`);
  }
  return links;
}

function isInside(path: string, directory: string): boolean {
  const rel = relative(directory, path);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !rel.startsWith(sep);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

async function isExactLink(path: string, source: string): Promise<boolean> {
  try {
    const stat = await lstat(path);
    return stat.isSymbolicLink() && (await readlink(path)) === source;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function formatTimestamp(date: Date): string {
  const digits = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${digits(date.getMonth() + 1)}${digits(date.getDate())}-${digits(date.getHours())}${digits(date.getMinutes())}${digits(date.getSeconds())}`;
}

async function ensureLoginShell(
  platform: Platform,
  runner: CommandRunner,
  env: Record<string, string | undefined>,
  dryRun: boolean,
  log: (message: string) => void,
  warn: (message: string) => void,
): Promise<void> {
  const zsh = whichInPath("zsh", env.PATH);
  if (!zsh) return;
  const user = env.USER || env.LOGNAME || process.env.USER;
  if (!user) return;
  const current = await loginShell(platform, runner, user, env);
  if (current === zsh) return;
  if (dryRun) {
    log(`[plan] set login shell to ${zsh}`);
    return;
  }

  let shells = "";
  try {
    shells = readFileSync("/etc/shells", "utf8");
  } catch {}
  if (!shells.split("\n").includes(zsh)) {
    const tee = privileged(["tee", "-a", "/etc/shells"]);
    await runner.run(tee, { env, stdinText: `${zsh}\n` });
  }

  let result = await runner.run(privileged(["chsh", "-s", zsh, user]), { env });
  if (result.exitCode !== 0) result = await runner.run(["chsh", "-s", zsh], { env });
  const verified = await loginShell(platform, runner, user, env);
  if (verified === zsh) log(`login shell set to ${zsh}`);
  else warn(`could not set the login shell — run: chsh -s ${zsh}`);
}

async function loginShell(
  platform: Platform,
  runner: CommandRunner,
  user: string,
  env: Record<string, string | undefined>,
): Promise<string> {
  const command: Command =
    platform === "darwin"
      ? ["dscl", ".", "-read", `/Users/${user}`, "UserShell"]
      : ["getent", "passwd", user];
  const result = await runner.run(command, { env });
  if (result.exitCode !== 0) return "";
  return platform === "darwin"
    ? (result.stdout.trim().split(/\s+/).at(-1) ?? "")
    : (result.stdout.trim().split(":")[6] ?? "");
}

function privileged(command: Command): Command {
  return typeof process.getuid === "function" && process.getuid() === 0
    ? command
    : (["sudo", ...command] as Command);
}

function whichInPath(binary: string, path: string | undefined): string | undefined {
  for (const directory of (path ?? "").split(":")) {
    const candidate = join(directory, binary);
    try {
      if (existsSync(candidate)) return candidate;
    } catch {}
  }
  return undefined;
}

async function main(): Promise<void> {
  const root = resolve(import.meta.dir, "..");
  const dryRun =
    process.argv.includes("--dry-run") ||
    process.argv.includes("--plan") ||
    process.env.DOTS_DRY_RUN === "1";
  const platform = platformFromEnvironment();
  await setup({
    dots: process.env.DOTS || root,
    home:
      process.env.HOME ||
      (() => {
        throw new Error("HOME is not set");
      })(),
    platform,
    dryRun,
    skipPackages: process.env.DOTS_SKIP_PACKAGES === "1",
  });
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`\x1b[1;31m==>\x1b[0m ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
