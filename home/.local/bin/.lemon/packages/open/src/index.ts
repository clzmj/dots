import { accessSync, constants } from "node:fs";

export type SupportedPlatform = "darwin" | "linux" | "win32";

export interface OpenBackend {
  readonly name: "open" | "xdg-open" | "gio" | "wslview" | "explorer";
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

  if (platform === "darwin") {
    if (executable("/usr/bin/open")) return { name: "open", command: ["/usr/bin/open"] };
    throw new OpenBackendError("/usr/bin/open is not executable");
  }

  if (platform === "win32") {
    return {
      name: "explorer",
      command: [which("explorer.exe") ?? "explorer.exe"],
    };
  }

  if (platform !== "linux") throw new OpenBackendError(`unsupported platform: ${platform}`);

  const wsl = Boolean(env.WSL_DISTRO_NAME || env.WSL_INTEROP);
  if (wsl) {
    const wslview = which("wslview");
    if (wslview) return { name: "wslview", command: [wslview] };
  }

  const xdgOpen = which("xdg-open");
  if (xdgOpen) return { name: "xdg-open", command: [xdgOpen] };

  const gio = which("gio");
  if (gio) return { name: "gio", command: [gio, "open"] };

  throw new OpenBackendError("no opener found (install xdg-open or gio)");
}

function defaultSpawn(command: readonly string[]): SpawnedProcess {
  return Bun.spawn([...command], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
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
