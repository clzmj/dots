import { accessSync, constants } from "node:fs";

export type Operation = "copy" | "paste";
export type Backend = "auto" | "native" | "wayland" | "x11";

export interface Runtime {
  platform: NodeJS.Platform;
  env: Readonly<Record<string, string | undefined>>;
  which(command: string): string | null;
  executable(path: string): boolean;
}

export function defaultRuntime(): Runtime {
  return {
    platform: process.platform,
    env: process.env,
    which: Bun.which,
    executable(path) {
      try {
        accessSync(path, constants.X_OK);
        return true;
      } catch {
        return false;
      }
    },
  };
}

function commandFor(backend: Exclude<Backend, "auto">, operation: Operation): string[] {
  if (backend === "native") return [`/usr/bin/pb${operation === "copy" ? "copy" : "paste"}`];
  if (backend === "wayland") return [operation === "copy" ? "wl-copy" : "wl-paste"];
  return operation === "copy"
    ? ["xclip", "-selection", "clipboard"]
    : ["xclip", "-selection", "clipboard", "-o"];
}

export function resolveCommand(
  operation: Operation,
  backend: Backend = "auto",
  runtime: Runtime = defaultRuntime(),
): string[] {
  const available = (candidate: Exclude<Backend, "auto">): boolean => {
    const command = commandFor(candidate, operation)[0]!;
    return candidate === "native" ? runtime.executable(command) : runtime.which(command) !== null;
  };

  if (backend !== "auto") {
    if (backend === "native" && runtime.platform !== "darwin") {
      throw new Error("native backend is only available on macOS");
    }
    if (!available(backend)) throw new Error(`${backend} clipboard backend is not installed`);
    return commandFor(backend, operation);
  }

  if (runtime.platform === "darwin" && available("native")) return commandFor("native", operation);
  const wayland =
    Boolean(runtime.env.WAYLAND_DISPLAY) ||
    runtime.env.XDG_SESSION_TYPE?.toLowerCase() === "wayland";
  if (wayland && available("wayland")) return commandFor("wayland", operation);
  if (available("x11")) return commandFor("x11", operation);
  const required = wayland ? "wl-clipboard (Wayland) or xclip (X11)" : "xclip (X11)";
  throw new Error(`no clipboard backend found; install ${required}`);
}
