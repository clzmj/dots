import {
  ChshFlag,
  CliFlag,
  CommandVerb,
  EnvironmentKey,
  EnvironmentValue,
  Executable,
  FilePattern,
  IdFlag,
  RepositoryPath,
  SystemErrorCode,
  SystemPath,
  TeeFlag,
  TextEncoding,
  UserPath,
} from "./lib/tokens";
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
  copyFile,
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
  Platform,
  OperatingSystem,
} from "./packages";

const GREEN = "\x1b[1;32m==>\x1b[0m";
const YELLOW = "\x1b[1;33m==>\x1b[0m";

export enum InstallMode {
  Copy = "copy",
  Symlink = "symlink",
}

export enum SetupAction {
  Link = "link",
  Copy = "copy",
  Write = "write",
}

export enum AnswerKey {
  Name = "NAME",
  Email = "EMAIL",
}

export type SetupPlanEntry =
  | { mode: SetupAction.Link | SetupAction.Copy; source: string; destination: string }
  | { mode: SetupAction.Write; destination: string };

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
  copied: number;
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
    return Buffer.from(bytes).toString(TextEncoding.Utf8).trim();
  }

  close(): void {
    if (this.descriptor !== undefined) closeSync(this.descriptor);
  }
}

export async function buildSetupPlan(
  dots: string,
  home: string,
  mode: InstallMode = InstallMode.Copy,
): Promise<SetupPlanEntry[]> {
  const sourceRoot = join(dots, RepositoryPath.Home);
  const entries: SetupPlanEntry[] = [];
  const glob = new Bun.Glob(FilePattern.Recursive);
  for await (const path of glob.scan({ cwd: sourceRoot, dot: true, onlyFiles: true })) {
    entries.push({
      mode: mode === InstallMode.Symlink ? SetupAction.Link : SetupAction.Copy,
      source: join(sourceRoot, path),
      destination: join(home, path),
    });
  }
  entries.sort((left, right) => left.destination.localeCompare(right.destination));
  entries.push({ mode: SetupAction.Write, destination: join(home, UserPath.GitIdentity) });
  return entries;
}

export async function findConflicts(
  plan: readonly SetupPlanEntry[],
  home: string,
): Promise<string[]> {
  const conflicts: string[] = [];
  for (const entry of plan) {
    if (!(await pathExists(entry.destination))) continue;
    if (entry.mode === SetupAction.Write) continue;
    if (await isInstalled(entry)) continue;
    conflicts.push(relative(home, entry.destination));
  }
  const legacyGit = join(home, UserPath.LegacyGitConfig);
  try {
    const stat = await lstat(legacyGit);
    if (stat.isFile() && !stat.isSymbolicLink()) conflicts.push(UserPath.LegacyGitConfig);
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  return conflicts;
}

export async function setup(options: SetupOptions): Promise<SetupResult> {
  const dots = resolve(options.dots);
  const home = resolve(options.home);
  const env: Record<string, string | undefined> = {
    ...process.env,
    ...options.env,
    [EnvironmentKey.Home]: home,
  };
  const dryRun = options.dryRun ?? false;
  const skipPackages =
    options.skipPackages ?? env[EnvironmentKey.SkipPackages] === EnvironmentValue.Enabled;
  const assumeYes = env[EnvironmentKey.AssumeYes] === EnvironmentValue.Enabled;
  const prompt = options.prompt ?? new TtyPrompt(assumeYes);
  const runner = options.runner ?? new BunCommandRunner();
  const log = options.log ?? ((message) => console.log(`${GREEN} ${message}`));
  const warn = options.warn ?? ((message) => console.error(`${YELLOW} ${message}`));
  const timestamp = formatTimestamp(new Date());
  const backup = join(home, UserPath.Backup, timestamp);
  let packageFailures = 0;

  try {
    log(
      `${options.platform === Platform.Darwin ? OperatingSystem.Darwin : OperatingSystem.Linux} detected${prompt.interactive ? "" : " (non-interactive)"}`,
    );
    log("configuration");
    const installMode = resolveInstallMode(env, prompt, warn);
    const answersFile = join(home, UserPath.Answers);
    const cached = await readAnswers(answersFile);
    const name = resolveAnswer(
      AnswerKey.Name,
      "Full name (git commits)",
      "Carlos Lezama",
      env,
      cached,
      prompt,
    );
    const email = resolveAnswer(
      AnswerKey.Email,
      "Email (git commits)",
      "carlos@example.com",
      env,
      cached,
      prompt,
    );
    if (!dryRun)
      await writeAnswers(answersFile, { [AnswerKey.Name]: name, [AnswerKey.Email]: email });

    if (skipPackages)
      warn("DOTS_SKIP_PACKAGES=1 — skipping optional packages (Bun and zsh remain required)");
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
        warn(
          `${packageFailures} package group(s) failed; installing config before reporting failure`,
        );
      if (dryRun)
        packageReport.planned.forEach((line) => {
          log(`[plan] ${line}`);
        });
    }

    const plan = await buildSetupPlan(dots, home, installMode);
    const conflicts = await findConflicts(plan, home);
    let overwrite = true;
    if (conflicts.length > 0) {
      warn(
        `you already have these files:\n${conflicts.map((path) => `      ~/${path}`).join("\n")}`,
      );
      overwrite =
        assumeYes ||
        prompt.confirm("Replace them with the dots config? (originals move to ~/.dots-backup)");
      if (!overwrite) warn("keeping your versions — everything else still gets installed");
    }

    const pruned = dryRun
      ? await findStaleLinks(home, dots)
      : await pruneStaleLinks(home, dots, warn);
    if (dryRun)
      pruned.forEach((path) => {
        log(`[plan] prune stale link ~/${relative(home, path)}`);
      });

    log(installMode === InstallMode.Copy ? "copying config" : "linking config");
    let linked = 0;
    let copied = 0;
    for (const entry of plan) {
      if (await isInstalled(entry)) continue;
      const relativeDestination = relative(home, entry.destination);
      if ((await pathExists(entry.destination)) && conflicts.includes(relativeDestination)) {
        if (!overwrite) continue;
        if (dryRun) log(`[plan] backup ~/${relativeDestination}`);
        else await stash(entry.destination, backup, home);
      }
      if (dryRun) {
        log(`[plan] ${entry.mode} ~/${relativeDestination}`);
        if (entry.mode === SetupAction.Link) linked++;
        else if (entry.mode === SetupAction.Copy) copied++;
        continue;
      }
      await mkdir(dirname(entry.destination), { recursive: true });
      if (entry.mode === SetupAction.Link) {
        await rm(entry.destination, { force: true, recursive: false });
        await symlink(entry.source, entry.destination);
        linked++;
      } else if (entry.mode === SetupAction.Copy) {
        await copyFile(entry.source, entry.destination);
        copied++;
      } else if (!(await pathExists(entry.destination))) {
        await writeFile(entry.destination, `[user]\n\tname = ${name}\n\temail = ${email}\n`);
      }
    }

    const legacyGit = join(home, UserPath.LegacyGitConfig);
    if (overwrite && conflicts.includes(UserPath.LegacyGitConfig)) {
      if (dryRun) log("[plan] backup ~/.gitconfig");
      else {
        await stash(legacyGit, backup, home);
        warn("moved ~/.gitconfig aside (it would shadow ~/.config/git/config)");
      }
    }

    await ensureLoginShell(options.platform, runner, env, dryRun, log);
    if (!dryRun && existsSync(backup)) log(`replaced files are in ${backup}`);
    if (!dryRun && packageFailures > 0) {
      throw new Error(
        `${packageFailures} package group(s) failed; config installation completed but setup is incomplete`,
      );
    }
    log(dryRun ? "dry-run complete" : "done — open a new shell");
    return {
      conflicts,
      backup: !dryRun && existsSync(backup) ? backup : undefined,
      linked,
      copied,
      pruned,
    };
  } finally {
    prompt.close();
  }
}

function resolveInstallMode(
  env: Record<string, string | undefined>,
  prompt: Prompt,
  warn: (message: string) => void,
): InstallMode {
  const override = env[EnvironmentKey.InstallMode];
  if (override) {
    const mode = Object.values(InstallMode).find((value) => value === override);
    if (mode !== undefined) return mode;
    throw new Error(
      `invalid ${EnvironmentKey.InstallMode}: ${override} (expected copy or symlink)`,
    );
  }
  if (env[EnvironmentKey.AssumeYes] === EnvironmentValue.Enabled || !prompt.interactive)
    return InstallMode.Copy;
  while (true) {
    const answer = prompt
      .ask("Install dotfiles: copy or symlink", InstallMode.Copy)
      .trim()
      .toLowerCase();
    if (!answer) return InstallMode.Copy;
    const mode = Object.values(InstallMode).find((value) => value === answer);
    if (mode !== undefined) return mode;
    warn("choose copy or symlink (press Enter for copy)");
  }
}

function resolveAnswer(
  key: AnswerKey,
  question: string,
  defaultValue: string,
  env: Record<string, string | undefined>,
  cached: Map<AnswerKey, string>,
  prompt: Prompt,
): string {
  return (
    env[`DOTS_${key}`] || cached.get(key) || prompt.ask(question, defaultValue) || defaultValue
  );
}

export async function readAnswers(path: string): Promise<Map<AnswerKey, string>> {
  const answers = new Map<AnswerKey, string>();
  let content: string;
  try {
    content = await readFile(path, TextEncoding.Utf8);
  } catch (error) {
    if (isMissing(error)) return answers;
    throw error;
  }
  for (const line of content.split("\n")) {
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = Object.values(AnswerKey).find((value) => value === line.slice(0, separator));
    if (key !== undefined) answers.set(key, line.slice(separator + 1));
  }
  return answers;
}

async function writeAnswers(path: string, answers: Record<AnswerKey, string>): Promise<void> {
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

async function isInstalled(entry: SetupPlanEntry): Promise<boolean> {
  if (entry.mode === SetupAction.Write) return false;
  if (entry.mode === SetupAction.Link) return isExactLink(entry.destination, entry.source);
  try {
    const destination = await lstat(entry.destination);
    if (!destination.isFile()) return false;
    const source = await lstat(entry.source);
    if (destination.size !== source.size || (destination.mode & 0o777) !== (source.mode & 0o777))
      return false;
    const [left, right] = await Promise.all([readFile(entry.destination), readFile(entry.source)]);
    return left.equals(right);
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === SystemErrorCode.MissingFile;
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
): Promise<void> {
  const zsh = whichInPath(Executable.Zsh, env[EnvironmentKey.Path]);
  if (!zsh) throw new Error("zsh is required but was not installed");
  const user =
    env[EnvironmentKey.User] || env[EnvironmentKey.Logname] || process.env[EnvironmentKey.User];
  if (!user) throw new Error("cannot set the zsh login shell without USER or LOGNAME");
  const current = await loginShell(platform, runner, user, env);
  if (current === zsh) return;
  if (dryRun) {
    log(`[plan] set login shell to ${zsh}`);
    return;
  }

  let shells = "";
  try {
    shells = readFileSync(SystemPath.Shells, TextEncoding.Utf8);
  } catch {}
  if (!shells.split("\n").includes(zsh)) {
    const tee = privileged([Executable.Tee, TeeFlag.Append, SystemPath.Shells]);
    await runner.run(tee, { env, stdinText: `${zsh}\n` });
  }

  let result = await runner.run(privileged([Executable.Chsh, ChshFlag.Shell, zsh, user]), { env });
  if (result.exitCode !== 0)
    result = await runner.run([Executable.Chsh, ChshFlag.Shell, zsh], { env });
  const verified = await loginShell(platform, runner, user, env);
  if (verified === zsh) log(`login shell set to ${zsh}`);
  else throw new Error(`could not set login shell to ${zsh}; run: sudo chsh -s ${zsh} ${user}`);
}

async function loginShell(
  platform: Platform,
  runner: CommandRunner,
  user: string,
  env: Record<string, string | undefined>,
): Promise<string> {
  const command: Command =
    platform === Platform.Darwin
      ? [Executable.Id, IdFlag.PasswordEntry, user]
      : [Executable.Getent, CommandVerb.Password, user];
  const result = await runner.run(command, { env });
  if (result.exitCode !== 0) return "";
  return result.stdout.trim().split(":").at(-1) ?? "";
}

function privileged(command: Command): Command {
  return typeof process.getuid === "function" && process.getuid() === 0
    ? command
    : ([Executable.Sudo, ...command] as Command);
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
    process.argv.includes(CliFlag.DryRun) ||
    process.argv.includes(CliFlag.Plan) ||
    process.env[EnvironmentKey.DryRun] === EnvironmentValue.Enabled;
  const platform = platformFromEnvironment();
  await setup({
    dots: process.env[EnvironmentKey.Dots] || root,
    home:
      process.env[EnvironmentKey.Home] ||
      (() => {
        throw new Error("HOME is not set");
      })(),
    platform,
    dryRun,
    skipPackages: process.env[EnvironmentKey.SkipPackages] === EnvironmentValue.Enabled,
  });
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`\x1b[1;31m==>\x1b[0m ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
