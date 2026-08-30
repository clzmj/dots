import { chmod, cp, lstat, mkdir, mkdtemp, readlink, rm, symlink } from "node:fs/promises";
import { accessSync, constants, existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import {
  BunCommandRunner,
  type Command,
  type CommandRunner,
  CommandError,
  runChecked,
  runParallel,
  runSerial,
  type Task,
  type TaskFailure,
} from "./lib/process";

export type Platform = "darwin" | "debian" | "fedora" | "arch";

export interface Architecture {
  deb: string;
  rpm: string;
  release: string;
  short: string;
}

export interface PackageContext {
  platform: Platform;
  os: "darwin" | "linux";
  arch: Architecture;
  home: string;
  env: Record<string, string>;
  runner: CommandRunner;
  dryRun: boolean;
  exists(test: string): boolean;
  log(message: string): void;
  warn(message: string): void;
  planned: string[];
}

export interface InstallOptions {
  platform?: Platform;
  arch?: Architecture;
  home?: string;
  runner?: CommandRunner;
  dryRun?: boolean;
  exists?: (test: string) => boolean;
  log?: (message: string) => void;
  warn?: (message: string) => void;
  env?: Record<string, string | undefined>;
}

export interface PackageReport {
  planned: string[];
  installed: string[];
  skipped: string[];
  failures: TaskFailure[];
}

interface NativePackage {
  test: string;
  packages: string[];
}

export function detectPlatform(
  os = process.platform,
  commands: { apt?: boolean; dnf?: boolean; pacman?: boolean } = {},
): Platform {
  if (os === "darwin") return "darwin";
  if (os !== "linux") throw new Error(`unsupported OS: ${os}`);
  if (commands.apt ?? Bun.which("apt-get") !== null) return "debian";
  if (commands.dnf ?? Bun.which("dnf") !== null) return "fedora";
  if (commands.pacman ?? Bun.which("pacman") !== null) return "arch";
  throw new Error("unsupported Linux distribution (need apt-get, dnf, or pacman)");
}

export function platformFromEnvironment(
  env: Record<string, string | undefined> = process.env,
  fallback: () => Platform = () => detectPlatform(),
): Platform {
  const override = env.DOTS_DOCKER_PLATFORM;
  if (override === undefined || override === "") return fallback();
  if (["darwin", "debian", "fedora", "arch"].includes(override)) return override as Platform;
  throw new Error(`invalid DOTS_DOCKER_PLATFORM: ${override}`);
}

export function detectArchitecture(machine = process.arch): Architecture {
  switch (machine) {
    case "x64":
    case "x86_64":
    case "amd64":
      return { deb: "amd64", rpm: "x86_64", release: "x86_64", short: "x64" };
    case "arm64":
    case "aarch64":
      return { deb: "arm64", rpm: "aarch64", release: "aarch64", short: "arm64" };
    default:
      return { deb: machine, rpm: machine, release: machine, short: machine };
  }
}

const NATIVE: Record<Platform, NativePackage[]> = {
  darwin: [
    { test: "@brew/git", packages: ["git"] },
    { test: "@brew/curl", packages: ["curl"] },
    { test: "rg", packages: ["ripgrep"] },
    { test: "fd", packages: ["fd"] },
    { test: "bat", packages: ["bat"] },
    { test: "eza", packages: ["eza"] },
    { test: "fzf", packages: ["fzf"] },
    { test: "jq", packages: ["jq"] },
    { test: "delta", packages: ["git-delta"] },
    { test: "gh", packages: ["gh"] },
    { test: "btm", packages: ["bottom"] },
    { test: "hx", packages: ["helix"] },
    { test: "taplo", packages: ["taplo"] },
    { test: "go", packages: ["go"] },
    { test: "aws", packages: ["awscli"] },
    { test: "onefetch", packages: ["onefetch"] },
    { test: "tokei", packages: ["tokei"] },
    { test: "usql", packages: ["xo/xo/usql"] },
    { test: "terraform", packages: ["hashicorp/tap/terraform"] },
    { test: "terraform-ls", packages: ["hashicorp/tap/terraform-ls"] },
    { test: "@brew/zsh-autosuggestions", packages: ["zsh-autosuggestions"] },
    { test: "@brew/zsh-syntax-highlighting", packages: ["zsh-syntax-highlighting"] },
  ],
  debian: [
    { test: "zsh", packages: ["zsh"] },
    { test: "git", packages: ["git"] },
    { test: "curl", packages: ["curl"] },
    { test: "rg", packages: ["ripgrep"] },
    { test: "eza", packages: ["eza"] },
    { test: "fzf", packages: ["fzf"] },
    { test: "jq", packages: ["jq"] },
    { test: "delta", packages: ["git-delta"] },
    { test: "tokei", packages: ["tokei"] },
    { test: "xclip", packages: ["xclip"] },
    { test: "unzip", packages: ["unzip"] },
    { test: "xz", packages: ["xz-utils"] },
    { test: "cc", packages: ["build-essential"] },
    { test: "/usr/share/ca-certificates", packages: ["ca-certificates"] },
    {
      test: "/usr/share/zsh-autosuggestions/zsh-autosuggestions.zsh",
      packages: ["zsh-autosuggestions"],
    },
    {
      test: "/usr/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh",
      packages: ["zsh-syntax-highlighting"],
    },
  ],
  fedora: [
    { test: "cc", packages: ["gcc"] },
    { test: "zsh", packages: ["zsh"] },
    { test: "git", packages: ["git"] },
    { test: "curl", packages: ["curl"] },
    { test: "rg", packages: ["ripgrep"] },
    { test: "fd", packages: ["fd-find"] },
    { test: "bat", packages: ["bat"] },
    { test: "eza", packages: ["eza"] },
    { test: "fzf", packages: ["fzf"] },
    { test: "jq", packages: ["jq"] },
    { test: "delta", packages: ["git-delta"] },
    { test: "tokei", packages: ["tokei"] },
    { test: "onefetch", packages: ["onefetch"] },
    { test: "hx", packages: ["helix"] },
    { test: "go", packages: ["golang"] },
    { test: "gh", packages: ["gh"] },
    { test: "xclip", packages: ["xclip"] },
    { test: "unzip", packages: ["unzip"] },
    { test: "xz", packages: ["xz"] },
    {
      test: "/usr/share/zsh-autosuggestions/zsh-autosuggestions.zsh",
      packages: ["zsh-autosuggestions"],
    },
    {
      test: "/usr/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh",
      packages: ["zsh-syntax-highlighting"],
    },
  ],
  arch: [
    { test: "cc", packages: ["gcc"] },
    { test: "zsh", packages: ["zsh"] },
    { test: "git", packages: ["git"] },
    { test: "curl", packages: ["curl"] },
    { test: "rg", packages: ["ripgrep"] },
    { test: "fd", packages: ["fd"] },
    { test: "bat", packages: ["bat"] },
    { test: "eza", packages: ["eza"] },
    { test: "fzf", packages: ["fzf"] },
    { test: "jq", packages: ["jq"] },
    { test: "delta", packages: ["git-delta"] },
    { test: "tokei", packages: ["tokei"] },
    { test: "onefetch", packages: ["onefetch"] },
    { test: "helix", packages: ["helix"] },
    { test: "btm", packages: ["bottom"] },
    { test: "go", packages: ["go"] },
    { test: "gh", packages: ["github-cli"] },
    { test: "taplo", packages: ["taplo"] },
    { test: "xclip", packages: ["xclip"] },
    { test: "unzip", packages: ["unzip"] },
    { test: "xz", packages: ["xz"] },
    {
      test: "/usr/share/zsh/plugins/zsh-autosuggestions/zsh-autosuggestions.plugin.zsh",
      packages: ["zsh-autosuggestions"],
    },
    {
      test: "/usr/share/zsh/plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.plugin.zsh",
      packages: ["zsh-syntax-highlighting"],
    },
  ],
};

export function nativePackagesFor(platform: Platform): readonly NativePackage[] {
  return NATIVE[platform];
}

export async function installPackages(options: InstallOptions = {}): Promise<PackageReport> {
  const platform = options.platform ?? detectPlatform();
  const home = options.home ?? process.env.HOME;
  if (!home) throw new Error("HOME is not set");

  const env = normalizedEnv(home, options.env);
  const context: PackageContext = {
    platform,
    os: platform === "darwin" ? "darwin" : "linux",
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

  if (!context.dryRun) await mkdir(join(home, ".local/bin"), { recursive: true });
  const skipped: string[] = [];
  const failures: TaskFailure[] = [];
  const installed: string[] = [];

  if (platform === "darwin") await ensureHomebrew(context, failures);
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
  env.HOME = home;
  env.PATH = [
    join(home, ".local/bin"),
    join(home, ".bun/bin"),
    join(home, ".cargo/bin"),
    join(home, ".opencode/bin"),
    join(home, "go/bin"),
    "/usr/local/go/bin",
    env.PATH ?? "",
  ].join(":");
  return env;
}

function defaultExists(test: string, env: Record<string, string>): boolean {
  if (test.includes("/")) return existsSync(test);
  for (const directory of (env.PATH ?? "").split(":")) {
    if (!directory) continue;
    try {
      accessSync(join(directory, test), constants.X_OK);
      return true;
    } catch {}
  }
  return false;
}

function testPath(context: PackageContext, test: string): string {
  if (!test.startsWith("@brew/")) return test;
  const relative = test.slice("@brew/".length);
  const prefix =
    context.env.HOMEBREW_PREFIX ?? (process.arch === "arm64" ? "/opt/homebrew" : "/usr/local");
  if (relative === "git" || relative === "curl") return join(prefix, "bin", relative);
  return join(prefix, "share", relative, `${relative}.zsh`);
}

function missing(context: PackageContext, test: string, skipped: string[]): boolean {
  if (!context.exists(testPath(context, test))) return true;
  skipped.push(test.replace(/^@brew\//, ""));
  return false;
}

function sudo(command: Command): Command {
  return typeof process.getuid === "function" && process.getuid() === 0
    ? command
    : (["sudo", ...command] as Command);
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
  const known = [Bun.which("brew"), "/opt/homebrew/bin/brew", "/usr/local/bin/brew"].find(
    (candidate) => candidate && existsSync(candidate),
  );
  if (!known) {
    try {
      context.env.NONINTERACTIVE = "1";
      const script = context.dryRun
        ? ""
        : await downloadText("https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh");
      await commandTask(context, "homebrew", ["/bin/bash", "-s"], script);
    } catch (error) {
      failures.push({ name: "homebrew", error });
      return;
    }
  }
  const brew =
    known ?? (process.arch === "arm64" ? "/opt/homebrew/bin/brew" : "/usr/local/bin/brew");
  context.env.PATH = `${dirname(brew)}:${context.env.PATH}`;
  context.env.HOMEBREW_PREFIX = dirname(dirname(brew));
}

async function installNative(context: PackageContext, skipped: string[]) {
  const packages = NATIVE[context.platform]
    .filter((entry) => missing(context, entry.test, skipped))
    .flatMap((entry) => entry.packages);
  const unique = [...new Set(packages)];
  const commands: Array<{ name: string; command: Command }> = [];
  if (unique.length > 0) {
    if (context.platform === "darwin") {
      commands.push({ name: "brew", command: ["brew", "install", ...unique] });
    } else if (context.platform === "debian") {
      commands.push({ name: "apt update", command: sudo(["apt-get", "update", "-qq"]) });
      commands.push({
        name: "apt install",
        command: sudo(["apt-get", "install", "-y", ...unique]),
      });
    } else if (context.platform === "fedora") {
      commands.push({
        name: "dnf install",
        command: sudo(["dnf", "install", "-y", "--allowerasing", ...unique]),
      });
    } else {
      commands.push({
        name: "pacman install",
        command: sudo(["pacman", "-S", "--needed", "--noconfirm", ...unique]),
      });
    }
  }

  if (context.platform === "darwin") {
    const font = join(context.home, "Library/Fonts/JetBrainsMonoNerdFont-Regular.ttf");
    if (
      !context.exists(font) &&
      !context.exists("/Library/Fonts/JetBrainsMonoNerdFont-Regular.ttf")
    ) {
      commands.push({
        name: "font",
        command: ["brew", "install", "--cask", "font-jetbrains-mono-nerd-font"],
      });
    }
  }
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
  const serial: Task[] = [];
  const parallel: Task[] = [];
  if (context.platform === "debian") {
    if (missing(context, "fd", skipped))
      serial.push(
        releaseDebTask(
          context,
          "fd",
          "sharkdp/fd",
          ({ version }) => `fd_${version}_${context.arch.deb}.deb`,
        ),
      );
    if (missing(context, "bat", skipped))
      serial.push(
        releaseDebTask(
          context,
          "bat",
          "sharkdp/bat",
          ({ version }) => `bat_${version}_${context.arch.deb}.deb`,
        ),
      );
    if (missing(context, "btm", skipped))
      serial.push(
        releaseDebTask(
          context,
          "bottom",
          "ClementTsang/bottom",
          ({ version }) => `bottom_${version}-1_${context.arch.deb}.deb`,
        ),
      );
    if (missing(context, "gh", skipped))
      parallel.push(
        tarBinaryTask(
          context,
          "gh",
          "cli/cli",
          ({ version }) => `gh_${version}_linux_${context.arch.deb}.tar.gz`,
          "gh",
        ),
      );
    if (missing(context, "onefetch", skipped))
      parallel.push(
        tarBinaryTask(
          context,
          "onefetch",
          "o2sh/onefetch",
          () => "onefetch-linux.tar.gz",
          "onefetch",
        ),
      );
    if (missing(context, "taplo", skipped))
      parallel.push(
        singleBinaryTask(
          context,
          "taplo",
          "tamasfe/taplo",
          () => `taplo-linux-${context.arch.release}.gz`,
          "taplo",
        ),
      );
    if (missing(context, "hx", skipped)) parallel.push(helixTask(context));
    if (missing(context, "go", skipped)) parallel.push(goReleaseTask(context));
  } else if (context.platform === "fedora") {
    if (missing(context, "btm", skipped)) serial.push(bottomRpmTask(context));
    if (missing(context, "taplo", skipped))
      parallel.push(
        singleBinaryTask(
          context,
          "taplo",
          "tamasfe/taplo",
          () => `taplo-linux-${context.arch.release}.gz`,
          "taplo",
        ),
      );
  }
  const serialResult = await runSerial(serial);
  const parallelResult = await runParallel(parallel);
  return {
    completed: [...serialResult.completed, ...parallelResult.completed],
    failed: [...serialResult.failed, ...parallelResult.failed],
  };
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
      if (context.dryRun) return planDownload(context, name, repo, "deb");
      const download = await downloadRelease(repo, asset);
      try {
        const first = await context.runner.run(sudo(["dpkg", "-i", download.path]), {
          env: context.env,
        });
        if (first.exitCode !== 0)
          await runChecked(context.runner, sudo(["apt-get", "install", "-f", "-y"]), {
            env: context.env,
          });
      } finally {
        await download.cleanup();
      }
    },
  };
}

function bottomRpmTask(context: PackageContext): Task {
  return {
    name: "bottom",
    run: async () => {
      if (context.dryRun)
        return planDownload(context, "bottom", "ClementTsang/bottom", "rpm with tar fallback");
      try {
        const download = await downloadRelease(
          "ClementTsang/bottom",
          ({ version }) => `bottom-${version}-1.${context.arch.rpm}.rpm`,
        );
        try {
          await runChecked(context.runner, sudo(["rpm", "-Uvh", "--replacepkgs", download.path]), {
            env: context.env,
          });
        } finally {
          await download.cleanup();
        }
      } catch {
        await installTarBinary(
          context,
          "ClementTsang/bottom",
          () => `bottom_${context.arch.release}-unknown-linux-gnu.tar.gz`,
          "btm",
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
      if (context.dryRun) return planDownload(context, name, repo, "tar.gz");
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
    const destination = join(context.home, ".local/bin", binary);
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
      if (context.dryRun) return planDownload(context, name, repo, "binary");
      const download = await downloadRelease(repo, asset);
      try {
        let bytes = new Uint8Array(await Bun.file(download.path).arrayBuffer());
        if (download.path.endsWith(".gz")) bytes = Bun.gunzipSync(bytes);
        const destination = join(context.home, ".local/bin", binary);
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
    name: "helix",
    run: async () => {
      if (context.dryRun)
        return planDownload(context, "helix", "helix-editor/helix", "tar.xz + runtime");
      const download = await downloadRelease(
        "helix-editor/helix",
        ({ version }) => `helix-${version}-${context.arch.release}-linux.tar.xz`,
      );
      const extracted = await mkdtemp(join(tmpdir(), "dots-helix-"));
      try {
        await runChecked(context.runner, ["tar", "-xJf", download.path, "-C", extracted], {
          env: context.env,
        });
        const hx = await findExecutable(extracted, "hx");
        if (!hx) throw new Error(`hx missing from ${basename(download.path)}`);
        await cp(hx, join(context.home, ".local/bin/hx"));
        await chmod(join(context.home, ".local/bin/hx"), 0o755);
        const sourceRuntime = join(dirname(hx), "runtime");
        const targetRuntime = join(context.home, ".config/helix/runtime");
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
    name: "go",
    run: async () => {
      if (context.dryRun) return planDownload(context, "go", "go.dev", "tar.gz");
      const version = (await downloadText("https://go.dev/VERSION?m=text")).split("\n")[0]?.trim();
      if (!version) throw new Error("go.dev did not return a version");
      const response = await fetch(`https://go.dev/dl/${version}.linux-${context.arch.deb}.tar.gz`);
      if (!response.ok) throw new Error(`Go download failed: ${response.status}`);
      const directory = await mkdtemp(join(tmpdir(), "dots-go-"));
      const archive = join(directory, "go.tgz");
      try {
        await Bun.write(archive, response);
        await runChecked(context.runner, sudo(["rm", "-rf", "/usr/local/go"]), {
          env: context.env,
        });
        await runChecked(context.runner, sudo(["tar", "-C", "/usr/local", "-xzf", archive]), {
          env: context.env,
        });
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  };
}

async function installVendors(context: PackageContext, skipped: string[]) {
  const serial: Task[] = [];
  const parallel: Task[] = [];
  if (context.os === "linux" && missing(context, "tailscale", skipped)) {
    // This installer invokes the native package manager internally, so isolate it
    // from every other installer to avoid apt/dnf/pacman lock contention.
    serial.push(
      scriptInstaller(context, "tailscale", "https://tailscale.com/install.sh", ["sh", "-s"]),
    );
  }
  if (missing(context, "claude", skipped))
    parallel.push(
      scriptInstaller(context, "claude", "https://claude.ai/install.sh", ["bash", "-s"]),
    );
  if (missing(context, "codex", skipped))
    parallel.push(
      scriptInstaller(context, "codex", "https://chatgpt.com/codex/install.sh", ["sh", "-s"]),
    );
  if (missing(context, "opencode", skipped))
    parallel.push(
      scriptInstaller(context, "opencode", "https://opencode.ai/install", ["bash", "-s"]),
    );
  if (missing(context, "herdr", skipped))
    parallel.push(scriptInstaller(context, "herdr", "https://herdr.dev/install.sh", ["sh", "-s"]));
  if (missing(context, "uv", skipped))
    parallel.push(scriptInstaller(context, "uv", "https://astral.sh/uv/install.sh", ["sh", "-s"]));
  if (missing(context, "cargo", skipped)) {
    parallel.push(
      scriptInstaller(context, "rustup", "https://sh.rustup.rs", [
        "sh",
        "-s",
        "--",
        "-y",
        "--no-modify-path",
        "--profile",
        "minimal",
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
  const cargoCrates = ["zoxide", "starship", "just", "worktrunk"].filter((tool) =>
    missing(context, tool === "worktrunk" ? "wt" : tool, skipped),
  );
  if (cargoCrates.length > 0) {
    groups.push({
      name: "cargo tools",
      run: async () => {
        if (
          !context.dryRun &&
          !context.exists("cargo") &&
          !existsSync(join(context.home, ".cargo/bin/cargo"))
        ) {
          throw new Error("cargo unavailable after rustup");
        }
        for (const crate of cargoCrates)
          await commandTask(context, crate, ["cargo", "install", crate, "--locked"]);
      },
    });
  }

  const goModules: Array<[string, string]> = [
    ["gopls", "golang.org/x/tools/gopls"],
    ["speedtest", "github.com/showwin/speedtest-go"],
  ].filter(([tool]) => missing(context, tool, skipped)) as Array<[string, string]>;
  if (goModules.length > 0) {
    groups.push({
      name: "go tools",
      run: async () => {
        if (!context.dryRun && !context.exists("go") && !existsSync("/usr/local/go/bin/go"))
          throw new Error("go unavailable");
        for (const [tool, module] of goModules)
          await commandTask(context, tool, ["go", "install", `${module}@latest`]);
        const speedtestGo = join(context.home, "go/bin/speedtest-go");
        const speedtest = join(context.home, ".local/bin/speedtest");
        if (!context.dryRun && existsSync(speedtestGo)) {
          await rm(speedtest, { force: true });
          await symlink(speedtestGo, speedtest);
        }
      },
    });
  }

  const bunPackages: Array<[string, string]> = [
    ["pi", "@earendil-works/pi-coding-agent"],
    ["bash-language-server", "bash-language-server"],
    ["typescript-language-server", "typescript-language-server"],
    ["yaml-language-server", "yaml-language-server"],
    ["vscode-json-language-server", "vscode-langservers-extracted"],
  ].filter(([tool]) => missing(context, tool, skipped)) as Array<[string, string]>;
  if (bunPackages.length > 0) {
    groups.push({
      name: "bun globals",
      run: async () => {
        await commandTask(context, "bun globals", [
          "bun",
          "add",
          "-g",
          ...bunPackages.map(([, pkg]) => pkg),
        ]);
        if (!context.dryRun && !context.exists("node")) await wrapNodeShebangs(context.home);
      },
    });
  }
  return runParallel(groups);
}

async function wrapNodeShebangs(home: string): Promise<void> {
  const bin = join(home, ".bun/bin");
  const glob = new Bun.Glob("*");
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

interface Release {
  tag: string;
  version: string;
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

function planDownload(context: PackageContext, name: string, repo: string, kind: string): void {
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

if (import.meta.main) {
  const dryRun = process.argv.includes("--dry-run") || process.argv.includes("--plan");
  installPackages({ platform: platformFromEnvironment(), dryRun })
    .then((report) => {
      if (dryRun)
        report.planned.forEach((line) => {
          console.log(line);
        });
      if (report.failures.length > 0) process.exitCode = 1;
    })
    .catch((error) => {
      console.error(errorMessage(error));
      process.exitCode = 1;
    });
}
