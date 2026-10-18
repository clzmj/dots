import {
  PackageName,
  PackageTaskName,
  ReleaseRepository,
  ArchiveFlag,
  CommandVerb,
  EnvironmentKey,
  EnvironmentValue,
  Executable,
  FilePattern,
  DirectoryName,
  HomebrewPath,
  MachineArchitecture,
  PackageFlag,
  RemoveFlag,
  RustupArgument,
  ShellFlag,
  SystemPath,
  UserPath,
} from "../lib/tokens";
import { accessSync, constants, existsSync } from "node:fs";
import { chmod, cp, lstat, mkdir, mkdtemp, readlink, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import {
  BunCommandRunner,
  type Command,
  CommandError,
  runChecked,
  runParallel,
  runSerial,
  type Task,
  type TaskFailure,
} from "../lib/process";
import {
  type NativePackage,
  type PlatformRelease,
  platformInstallers,
  type Release,
  PlatformPreparation,
  ReleaseKind,
  ReleasePhase,
} from "./platforms";
import {
  type Architecture,
  type InstallOptions,
  type PackageContext,
  type PackageReport,
  OperatingSystem,
  Platform,
} from "./types";

export type { Architecture, InstallOptions, PackageContext, PackageReport } from "./types";
export { OperatingSystem, Platform } from "./types";

enum DownloadFormat {
  Deb = "deb",
  RpmWithTarFallback = "rpm with tar fallback",
  TarGz = "tar.gz",
  Binary = "binary",
  HelixRuntime = "tar.xz + runtime",
}

export function detectPlatform(
  os = process.platform,
  commands: { apt?: boolean; dnf?: boolean; pacman?: boolean } = {},
): Platform {
  if (os === OperatingSystem.Darwin) return Platform.Darwin;
  if (os !== OperatingSystem.Linux) throw new Error(`unsupported OS: ${os}`);
  if (commands.apt ?? Bun.which(Executable.AptGet) !== null) return Platform.Debian;
  if (commands.dnf ?? Bun.which(Executable.Dnf) !== null) return Platform.Fedora;
  if (commands.pacman ?? Bun.which(Executable.Pacman) !== null) return Platform.Arch;
  throw new Error("unsupported Linux distribution (need apt-get, dnf, or pacman)");
}

export function platformFromEnvironment(
  env: Record<string, string | undefined> = process.env,
  fallback: () => Platform = () => detectPlatform(),
): Platform {
  const override = env[EnvironmentKey.DockerPlatform];
  if (override === undefined || override === "") return fallback();
  const platform = Object.values(Platform).find((value) => value === override);
  if (platform !== undefined) return platform;
  throw new Error(`invalid ${EnvironmentKey.DockerPlatform}: ${override}`);
}

export function detectArchitecture(machine: string = process.arch): Architecture {
  switch (machine) {
    case MachineArchitecture.X64:
    case MachineArchitecture.X86_64:
    case MachineArchitecture.Amd64:
      return {
        deb: MachineArchitecture.Amd64,
        rpm: MachineArchitecture.X86_64,
        release: MachineArchitecture.X86_64,
        short: MachineArchitecture.X64,
      };
    case MachineArchitecture.Arm64:
    case MachineArchitecture.Aarch64:
      return {
        deb: MachineArchitecture.Arm64,
        rpm: MachineArchitecture.Aarch64,
        release: MachineArchitecture.Aarch64,
        short: MachineArchitecture.Arm64,
      };
    default:
      return { deb: machine, rpm: machine, release: machine, short: machine };
  }
}

export function nativePackagesFor(platform: Platform): readonly NativePackage[] {
  return platformInstallers[platform].native;
}

export async function installPackages(options: InstallOptions = {}): Promise<PackageReport> {
  const platform = options.platform ?? detectPlatform();
  const installer = platformInstallers[platform];
  const home = options.home ?? process.env[EnvironmentKey.Home];
  if (!home) throw new Error("HOME is not set");

  const env = normalizedEnv(home, options.env);
  const context: PackageContext = {
    platform,
    os: platform === Platform.Darwin ? OperatingSystem.Darwin : OperatingSystem.Linux,
    arch: options.arch ?? detectArchitecture(),
    home,
    env,
    runner: options.runner ?? new BunCommandRunner(),
    dryRun: options.dryRun ?? false,
    exists: options.exists ?? ((test) => defaultExists(test, env)),
    log: options.log ?? console.log,
    warn: options.warn ?? ((message) => console.error(message)),
    planned: [],
  };

  if (!context.dryRun) await mkdir(join(home, UserPath.LocalBin), { recursive: true });
  const skipped: string[] = [];
  const failures: TaskFailure[] = [];
  const installed: string[] = [];

  if (installer.prepare === PlatformPreparation.Homebrew) await ensureHomebrew(context, failures);
  if (failures.length > 0) {
    for (const failure of failures)
      context.warn(`  ✗ ${failure.name}: ${errorMessage(failure.error)}`);
    return { planned: context.planned, installed, skipped, failures };
  }

  context.log("packages: native");
  const nativeResult = await installNative(context, skipped);
  failures.push(...nativeResult.failed);
  installed.push(...nativeResult.completed);
  if (nativeResult.failed.length > 0) {
    for (const failure of failures)
      context.warn(`  ✗ ${failure.name}: ${errorMessage(failure.error)}`);
    return { planned: context.planned, installed, skipped, failures };
  }

  context.log("packages: platform releases");
  const platformResult = await installPlatformReleases(context, skipped);
  failures.push(...platformResult.failed);
  installed.push(...platformResult.completed);

  context.log("packages: vendor installers");
  const vendorResult = await installVendors(context, skipped);
  failures.push(...vendorResult.failed);
  installed.push(...vendorResult.completed);

  context.log("packages: language tools");
  const languageResult = await installLanguageTools(context, skipped);
  failures.push(...languageResult.failed);
  installed.push(...languageResult.completed);

  for (const failure of failures)
    context.warn(`  ✗ ${failure.name}: ${errorMessage(failure.error)}`);
  return { planned: context.planned, installed, skipped, failures };
}

function normalizedEnv(home: string, overrides: InstallOptions["env"]): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) if (value !== undefined) env[key] = value;
  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  env[EnvironmentKey.Home] = home;
  env[EnvironmentKey.Path] = [
    join(home, UserPath.LocalBin),
    join(home, UserPath.BunBin),
    join(home, UserPath.CargoBin),
    join(home, UserPath.OpencodeBin),
    join(home, UserPath.GoBin),
    SystemPath.GoBin,
    env[EnvironmentKey.Path] ?? "",
  ].join(":");
  return env;
}

function defaultExists(test: string, env: Record<string, string>): boolean {
  if (test.includes("/")) return existsSync(test);
  for (const directory of (env[EnvironmentKey.Path] ?? "").split(":")) {
    if (!directory) continue;
    try {
      accessSync(join(directory, test), constants.X_OK);
      return true;
    } catch {}
  }
  return false;
}

function testPath(context: PackageContext, test: string): string {
  if (!test.startsWith(HomebrewPath.Prefix)) return test;
  const relative = test.slice(HomebrewPath.Prefix.length);
  const prefix =
    context.env[EnvironmentKey.HomebrewPrefix] ??
    (process.arch === MachineArchitecture.Arm64
      ? SystemPath.HomebrewArmPrefix
      : SystemPath.LocalPrefix);
  if (relative === Executable.Git || relative === Executable.Curl)
    return join(prefix, DirectoryName.Bin, relative);
  return join(prefix, DirectoryName.Share, relative, `${relative}.zsh`);
}

function missing(context: PackageContext, test: string, skipped: string[]): boolean {
  if (!context.exists(testPath(context, test))) return true;
  skipped.push(test.replace(/^@brew\//, ""));
  return false;
}

function sudo(command: Command): Command {
  return typeof process.getuid === "function" && process.getuid() === 0
    ? command
    : ([Executable.Sudo, ...command] as Command);
}

async function commandTask(
  context: PackageContext,
  name: string,
  command: Command,
  stdinText?: string,
): Promise<void> {
  context.planned.push(`${name}: ${command.join(" ")}`);
  if (context.dryRun) return;
  await runChecked(context.runner, command, { env: context.env, stdinText });
}

async function ensureHomebrew(context: PackageContext, failures: TaskFailure[]): Promise<void> {
  const known = [
    Bun.which(Executable.Brew),
    SystemPath.HomebrewArmExecutable,
    SystemPath.HomebrewIntelExecutable,
  ].find((candidate) => candidate && existsSync(candidate));
  if (!known) {
    try {
      context.env[EnvironmentKey.NonInteractive] = EnvironmentValue.Enabled;
      const script = context.dryRun
        ? ""
        : await downloadText("https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh");
      await commandTask(
        context,
        PackageTaskName.Homebrew,
        [Executable.BashSystem, ShellFlag.Stdin],
        script,
      );
    } catch (error) {
      failures.push({ name: PackageTaskName.Homebrew, error });
      return;
    }
  }
  const brew =
    known ??
    (process.arch === MachineArchitecture.Arm64
      ? SystemPath.HomebrewArmExecutable
      : SystemPath.HomebrewIntelExecutable);
  context.env[EnvironmentKey.Path] = `${dirname(brew)}:${context.env[EnvironmentKey.Path]}`;
  context.env[EnvironmentKey.HomebrewPrefix] = dirname(dirname(brew));
}

async function installNative(context: PackageContext, skipped: string[]) {
  const installer = platformInstallers[context.platform];
  const packages = installer.native
    .filter((entry) => missing(context, entry.test, skipped))
    .flatMap((entry) => entry.packages);
  const unique = [...new Set(packages)];
  const commands = installer.nativeCommands(unique, context, sudo);
  if (commands.length === 0) return runSerial([]);
  return runSerial([
    {
      name: `native ${context.platform}`,
      run: async () => {
        // One fail-fast task is the dependency barrier: apt install must never run
        // after a failed index refresh, and later stages require this whole stage.
        for (const item of commands) await commandTask(context, item.name, item.command);
      },
    },
  ]);
}

async function installPlatformReleases(context: PackageContext, skipped: string[]) {
  const releases = platformInstallers[context.platform].releases.filter((release) =>
    missing(context, release.test, skipped),
  );
  const serial = releases
    .filter((release) => release.phase === ReleasePhase.Serial)
    .map((release) => platformReleaseTask(context, release));
  const parallel = releases
    .filter((release) => release.phase === ReleasePhase.Parallel)
    .map((release) => platformReleaseTask(context, release));
  const serialResult = await runSerial(serial);
  const parallelResult = await runParallel(parallel);
  return {
    completed: [...serialResult.completed, ...parallelResult.completed],
    failed: [...serialResult.failed, ...parallelResult.failed],
  };
}

function platformReleaseTask(context: PackageContext, release: PlatformRelease): Task {
  switch (release.kind) {
    case ReleaseKind.Deb:
      return releaseDebTask(context, release.name, release.repo, (latest) =>
        release.asset(latest, context.arch),
      );
    case ReleaseKind.RpmBottom:
      return bottomRpmTask(context);
    case ReleaseKind.Tar:
      return tarBinaryTask(
        context,
        release.name,
        release.repo,
        (latest) => release.asset(latest, context.arch),
        release.binary,
      );
    case ReleaseKind.Binary:
      return singleBinaryTask(
        context,
        release.name,
        release.repo,
        (latest) => release.asset(latest, context.arch),
        release.binary,
      );
    case ReleaseKind.Helix:
      return helixTask(context);
    case ReleaseKind.Go:
      return goReleaseTask(context);
  }
}

function releaseDebTask(
  context: PackageContext,
  name: string,
  repo: string,
  asset: (release: Release) => string,
): Task {
  return {
    name,
    run: async () => {
      if (context.dryRun) return planDownload(context, name, repo, DownloadFormat.Deb);
      const download = await downloadRelease(repo, asset);
      try {
        const first = await context.runner.run(
          sudo([Executable.Dpkg, PackageFlag.DpkgInstall, download.path]),
          {
            env: context.env,
          },
        );
        if (first.exitCode !== 0)
          await runChecked(
            context.runner,
            sudo([Executable.AptGet, CommandVerb.Install, PackageFlag.FixBroken, PackageFlag.Yes]),
            {
              env: context.env,
            },
          );
      } finally {
        await download.cleanup();
      }
    },
  };
}

function bottomRpmTask(context: PackageContext): Task {
  return {
    name: PackageTaskName.Bottom,
    run: async () => {
      if (context.dryRun)
        return planDownload(
          context,
          PackageTaskName.Bottom,
          ReleaseRepository.Bottom,
          DownloadFormat.RpmWithTarFallback,
        );
      try {
        const download = await downloadRelease(
          ReleaseRepository.Bottom,
          ({ version }) => `bottom-${version}-1.${context.arch.rpm}.rpm`,
        );
        try {
          await runChecked(
            context.runner,
            sudo([
              Executable.Rpm,
              PackageFlag.RpmUpgrade,
              PackageFlag.ReplacePackages,
              download.path,
            ]),
            {
              env: context.env,
            },
          );
        } finally {
          await download.cleanup();
        }
      } catch {
        await installTarBinary(
          context,
          ReleaseRepository.Bottom,
          () => `bottom_${context.arch.release}-unknown-linux-gnu.tar.gz`,
          Executable.Bottom,
        );
      }
    },
  };
}

function tarBinaryTask(
  context: PackageContext,
  name: string,
  repo: string,
  asset: (release: Release) => string,
  binary: string,
): Task {
  return {
    name,
    run: async () => {
      if (context.dryRun) return planDownload(context, name, repo, DownloadFormat.TarGz);
      await installTarBinary(context, repo, asset, binary);
    },
  };
}

async function installTarBinary(
  context: PackageContext,
  repo: string,
  asset: (release: Release) => string,
  binary: string,
): Promise<void> {
  const download = await downloadRelease(repo, asset);
  const extracted = await mkdtemp(join(tmpdir(), "dots-release-"));
  try {
    const bytes = await Bun.file(download.path).arrayBuffer();
    await new Bun.Archive(bytes).extract(extracted, { glob: [`**/${binary}`, binary] });
    const source = await findExecutable(extracted, binary);
    if (!source) throw new Error(`${binary} missing from ${basename(download.path)}`);
    const destination = join(context.home, UserPath.LocalBin, binary);
    await cp(source, destination);
    await chmod(destination, 0o755);
  } finally {
    await rm(extracted, { recursive: true, force: true });
    await download.cleanup();
  }
}

function singleBinaryTask(
  context: PackageContext,
  name: string,
  repo: string,
  asset: (release: Release) => string,
  binary: string,
): Task {
  return {
    name,
    run: async () => {
      if (context.dryRun) return planDownload(context, name, repo, DownloadFormat.Binary);
      const download = await downloadRelease(repo, asset);
      try {
        let bytes = new Uint8Array(await Bun.file(download.path).arrayBuffer());
        if (download.path.endsWith(".gz")) bytes = Bun.gunzipSync(bytes);
        const destination = join(context.home, UserPath.LocalBin, binary);
        await Bun.write(destination, bytes);
        await chmod(destination, 0o755);
      } finally {
        await download.cleanup();
      }
    },
  };
}

function helixTask(context: PackageContext): Task {
  return {
    name: Executable.Helix,
    run: async () => {
      if (context.dryRun)
        return planDownload(
          context,
          Executable.Helix,
          ReleaseRepository.Helix,
          DownloadFormat.HelixRuntime,
        );
      const download = await downloadRelease(
        ReleaseRepository.Helix,
        ({ version }) => `helix-${version}-${context.arch.release}-linux.tar.xz`,
      );
      const extracted = await mkdtemp(join(tmpdir(), "dots-helix-"));
      try {
        await runChecked(
          context.runner,
          [Executable.Tar, ArchiveFlag.ExtractXz, download.path, ArchiveFlag.Directory, extracted],
          {
            env: context.env,
          },
        );
        const hx = await findExecutable(extracted, Executable.Hx);
        if (!hx) throw new Error(`hx missing from ${basename(download.path)}`);
        await cp(hx, join(context.home, UserPath.Hx));
        await chmod(join(context.home, UserPath.Hx), 0o755);
        const sourceRuntime = join(dirname(hx), "runtime");
        const targetRuntime = join(context.home, UserPath.HelixRuntime);
        await rm(targetRuntime, { recursive: true, force: true });
        await mkdir(dirname(targetRuntime), { recursive: true });
        await cp(sourceRuntime, targetRuntime, { recursive: true });
      } finally {
        await rm(extracted, { recursive: true, force: true });
        await download.cleanup();
      }
    },
  };
}

function goReleaseTask(context: PackageContext): Task {
  return {
    name: Executable.Go,
    run: async () => {
      if (context.dryRun)
        return planDownload(context, Executable.Go, "go.dev", DownloadFormat.TarGz);
      const version = (await downloadText("https://go.dev/VERSION?m=text")).split("\n")[0]?.trim();
      if (!version) throw new Error("go.dev did not return a version");
      const response = await fetch(`https://go.dev/dl/${version}.linux-${context.arch.deb}.tar.gz`);
      if (!response.ok) throw new Error(`Go download failed: ${response.status}`);
      const directory = await mkdtemp(join(tmpdir(), "dots-go-"));
      const archive = join(directory, "go.tgz");
      try {
        await Bun.write(archive, response);
        await runChecked(
          context.runner,
          sudo([Executable.Remove, RemoveFlag.RecursiveForce, SystemPath.GoRoot]),
          {
            env: context.env,
          },
        );
        await runChecked(
          context.runner,
          sudo([
            Executable.Tar,
            ArchiveFlag.Directory,
            SystemPath.LocalPrefix,
            ArchiveFlag.ExtractGzip,
            archive,
          ]),
          {
            env: context.env,
          },
        );
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  };
}

async function installVendors(context: PackageContext, skipped: string[]) {
  const serial: Task[] = [];
  const parallel: Task[] = [];
  if (context.os === OperatingSystem.Linux && missing(context, Executable.Tailscale, skipped)) {
    // This installer invokes the native package manager internally, so isolate it
    // from every other installer to avoid apt/dnf/pacman lock contention.
    serial.push(
      scriptInstaller(context, Executable.Tailscale, "https://tailscale.com/install.sh", [
        Executable.Sh,
        ShellFlag.Stdin,
      ]),
    );
  }
  if (missing(context, Executable.Claude, skipped))
    parallel.push(
      scriptInstaller(context, Executable.Claude, "https://claude.ai/install.sh", [
        Executable.Bash,
        ShellFlag.Stdin,
      ]),
    );
  if (missing(context, Executable.Codex, skipped))
    parallel.push(
      scriptInstaller(context, Executable.Codex, "https://chatgpt.com/codex/install.sh", [
        Executable.Sh,
        ShellFlag.Stdin,
      ]),
    );
  if (missing(context, Executable.Opencode, skipped))
    parallel.push(
      scriptInstaller(context, Executable.Opencode, "https://opencode.ai/install", [
        Executable.Bash,
        ShellFlag.Stdin,
      ]),
    );
  if (missing(context, Executable.Herdr, skipped))
    parallel.push(
      scriptInstaller(context, Executable.Herdr, "https://herdr.dev/install.sh", [
        Executable.Sh,
        ShellFlag.Stdin,
      ]),
    );
  if (missing(context, Executable.Uv, skipped))
    parallel.push(
      scriptInstaller(context, Executable.Uv, "https://astral.sh/uv/install.sh", [
        Executable.Sh,
        ShellFlag.Stdin,
      ]),
    );
  if (missing(context, Executable.Cargo, skipped)) {
    parallel.push(
      scriptInstaller(context, "rustup", "https://sh.rustup.rs", [
        Executable.Sh,
        ShellFlag.Stdin,
        RustupArgument.Separator,
        PackageFlag.Yes,
        RustupArgument.NoModifyPath,
        RustupArgument.Profile,
        RustupArgument.MinimalProfile,
      ]),
    );
  }
  const serialResult = await runSerial(serial);
  const parallelResult = await runParallel(parallel);
  return {
    completed: [...serialResult.completed, ...parallelResult.completed],
    failed: [...serialResult.failed, ...parallelResult.failed],
  };
}

function scriptInstaller(
  context: PackageContext,
  name: string,
  url: string,
  command: Command,
): Task {
  return {
    name,
    run: async () => {
      context.planned.push(`${name}: ${url}`);
      if (context.dryRun) return;
      const script = await downloadText(url);
      await runChecked(context.runner, command, { env: context.env, stdinText: script });
    },
  };
}

async function installLanguageTools(context: PackageContext, skipped: string[]) {
  const groups: Task[] = [];
  const cargoCrates = [
    PackageName.Zoxide,
    PackageName.Starship,
    PackageName.Just,
    PackageName.Worktrunk,
  ].filter((tool) =>
    missing(context, tool === PackageName.Worktrunk ? Executable.WorktrunkCommand : tool, skipped),
  );
  if (cargoCrates.length > 0) {
    groups.push({
      name: "cargo tools",
      run: async () => {
        if (
          !context.dryRun &&
          !context.exists(Executable.Cargo) &&
          !existsSync(join(context.home, ".cargo/bin/cargo"))
        ) {
          throw new Error("cargo unavailable after rustup");
        }
        for (const crate of cargoCrates)
          await commandTask(context, crate, [
            Executable.Cargo,
            CommandVerb.Install,
            crate,
            PackageFlag.Locked,
          ]);
      },
    });
  }

  const goModules: Array<[string, string]> = [
    [Executable.Gopls, "golang.org/x/tools/gopls"],
    [Executable.Speedtest, "github.com/showwin/speedtest-go"],
  ].filter(([tool]) => missing(context, tool, skipped)) as Array<[string, string]>;
  if (goModules.length > 0) {
    groups.push({
      name: "go tools",
      run: async () => {
        if (
          !context.dryRun &&
          !context.exists(Executable.Go) &&
          !existsSync(SystemPath.GoExecutable)
        )
          throw new Error("go unavailable");
        for (const [tool, module] of goModules)
          await commandTask(context, tool, [
            Executable.Go,
            CommandVerb.Install,
            `${module}@latest`,
          ]);
        const speedtestGo = join(context.home, "go/bin/speedtest-go");
        const speedtest = join(context.home, ".local/bin/speedtest");
        if (!context.dryRun && existsSync(speedtestGo)) {
          await rm(speedtest, { force: true });
          await symlink(speedtestGo, speedtest);
        }
      },
    });
  }

  const missingBunPackages: Array<[string, string]> = [
    [Executable.Pi, PackageName.PiCodingAgent],
    [Executable.BashLanguageServer, Executable.BashLanguageServer],
    [Executable.TypeScriptLanguageServer, Executable.TypeScriptLanguageServer],
    [Executable.YamlLanguageServer, Executable.YamlLanguageServer],
    [Executable.JsonLanguageServer, PackageName.VsCodeLanguageServers],
  ].filter(([tool]) => missing(context, tool, skipped)) as Array<[string, string]>;
  const bunPackages = missingBunPackages.map(([, packageName]) => packageName);
  if (bunPackages.length > 0) {
    groups.push({
      name: PackageTaskName.BunGlobals,
      run: async () => {
        await commandTask(context, PackageTaskName.BunGlobals, [
          Executable.Bun,
          CommandVerb.Install,
          PackageFlag.Global,
          ...bunPackages,
        ]);
        if (!context.dryRun && !context.exists(Executable.Node))
          await wrapNodeShebangs(context.home);
      },
    });
  }
  return runParallel(groups);
}

async function wrapNodeShebangs(home: string): Promise<void> {
  const bin = join(home, UserPath.BunBin);
  const glob = new Bun.Glob(FilePattern.Any);
  for await (const entry of glob.scan({ cwd: bin, dot: true, onlyFiles: false })) {
    const link = join(bin, entry);
    let target: string;
    try {
      const stat = await lstat(link);
      if (!stat.isSymbolicLink()) continue;
      const raw = await readlink(link);
      target = raw.startsWith("/") ? raw : join(dirname(link), raw);
      const first = (await Bun.file(target).text()).split("\n", 1)[0];
      if (!first?.includes("env node")) continue;
    } catch {
      continue;
    }
    await rm(link, { force: true });
    await Bun.write(link, `#!/bin/sh\nexec "${join(home, ".bun/bin/bun")}" "${target}" "$@"\n`);
    await chmod(link, 0o755);
  }
}

async function latestRelease(repo: string): Promise<Release> {
  const response = await fetch(`https://github.com/${repo}/releases/latest`, {
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`${repo} latest release failed: ${response.status}`);
  const tag = response.url.split("/tag/")[1]?.replace(/\/$/, "");
  if (!tag) throw new Error(`${repo} latest release did not redirect to a tag`);
  return { tag, version: tag.replace(/^v/, "") };
}

async function downloadRelease(
  repo: string,
  assetName: (release: Release) => string,
): Promise<{ path: string; cleanup(): Promise<void> }> {
  const release = await latestRelease(repo);
  const asset = assetName(release);
  const response = await fetch(
    `https://github.com/${repo}/releases/download/${release.tag}/${asset}`,
  );
  if (!response.ok) throw new Error(`${repo}/${asset} download failed: ${response.status}`);
  const directory = await mkdtemp(join(tmpdir(), "dots-download-"));
  const destination = join(directory, asset);
  await Bun.write(destination, response);
  return {
    path: destination,
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}

async function downloadText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} failed: ${response.status}`);
  return response.text();
}

function planDownload(
  context: PackageContext,
  name: string,
  repo: string,
  kind: DownloadFormat,
): void {
  context.planned.push(`${name}: download ${kind} from ${repo}`);
}

async function findExecutable(root: string, name: string): Promise<string | undefined> {
  const glob = new Bun.Glob(`**/${name}`);
  for await (const relative of glob.scan({ cwd: root, dot: true, onlyFiles: true }))
    return join(root, relative);
  if (existsSync(join(root, name))) return join(root, name);
  return undefined;
}

function errorMessage(error: unknown): string {
  if (error instanceof CommandError) return error.message;
  return error instanceof Error ? error.message : String(error);
}
