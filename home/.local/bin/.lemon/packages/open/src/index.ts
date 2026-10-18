import { ProcessIO, RuntimePlatform as SupportedPlatform } from "../../../shared/tokens";
import { accessSync, constants } from "node:fs";

export { RuntimePlatform as SupportedPlatform } from "../../../shared/tokens";

export enum OpenBackendName {
  Open = "open",
  XdgOpen = "xdg-open",
  Gio = "gio",
  Wslview = "wslview",
  Explorer = "explorer",
}

export enum OpenCommand {
  Native = "/usr/bin/open",
  Explorer = "explorer.exe",
}

export enum OpenEnvironment {
  WslDistroName = "WSL_DISTRO_NAME",
  WslInterop = "WSL_INTEROP",
}

export interface OpenBackend {
  readonly name: OpenBackendName;
  readonly command: readonly string[];
}

export interface SpawnedProcess {
  readonly exited: Promise<number>;
}

export interface ResolveOpenOptions {
  readonly platform?: NodeJS.Platform;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly which?: (command: string) => string | null;
  readonly executable?: (path: string) => boolean;
}

export interface OpenOptions extends ResolveOpenOptions {
  readonly spawn?: (command: readonly string[]) => SpawnedProcess;
}

export class OpenBackendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenBackendError";
  }
}

function defaultExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolveOpenBackend(options: ResolveOpenOptions = {}): OpenBackend {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const which = options.which ?? Bun.which;
  const executable = options.executable ?? defaultExecutable;

  if (platform === SupportedPlatform.Darwin) {
    if (executable(OpenCommand.Native))
      return { name: OpenBackendName.Open, command: [OpenCommand.Native] };
    throw new OpenBackendError("/usr/bin/open is not executable");
  }

  if (platform === SupportedPlatform.Windows) {
    return {
      name: OpenBackendName.Explorer,
      command: [which(OpenCommand.Explorer) ?? OpenCommand.Explorer],
    };
  }

  if (platform !== SupportedPlatform.Linux)
    throw new OpenBackendError(`unsupported platform: ${platform}`);

  const wsl = Boolean(env[OpenEnvironment.WslDistroName] || env[OpenEnvironment.WslInterop]);
  if (wsl) {
    const wslview = which(OpenBackendName.Wslview);
    if (wslview) return { name: OpenBackendName.Wslview, command: [wslview] };
  }

  const xdgOpen = which(OpenBackendName.XdgOpen);
  if (xdgOpen) return { name: OpenBackendName.XdgOpen, command: [xdgOpen] };

  const gio = which(OpenBackendName.Gio);
  if (gio) return { name: OpenBackendName.Gio, command: [gio, OpenBackendName.Open] };

  throw new OpenBackendError("no opener found (install xdg-open or gio)");
}

function defaultSpawn(command: readonly string[]): SpawnedProcess {
  return Bun.spawn([...command], {
    stdin: ProcessIO.Inherit,
    stdout: ProcessIO.Inherit,
    stderr: ProcessIO.Inherit,
  });
}

export async function openTargets(
  targets: readonly string[],
  options: OpenOptions = {},
): Promise<number> {
  if (targets.length === 0) throw new TypeError("at least one target is required");

  const backend = resolveOpenBackend(options);
  const spawn = options.spawn ?? defaultSpawn;
  for (const target of targets) {
    const status = await spawn([...backend.command, target]).exited;
    if (status !== 0) return status;
  }
  return 0;
}
