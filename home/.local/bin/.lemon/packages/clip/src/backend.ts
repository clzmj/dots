import { RuntimePlatform } from "../../../shared/tokens";
import { accessSync, constants } from "node:fs";

export enum Operation {
  Copy = "copy",
  Paste = "paste",
}

export enum Backend {
  Auto = "auto",
  Native = "native",
  Wayland = "wayland",
  X11 = "x11",
}

export enum ClipboardCommand {
  PbCopy = "/usr/bin/pbcopy",
  PbPaste = "/usr/bin/pbpaste",
  WlCopy = "wl-copy",
  WlPaste = "wl-paste",
  Xclip = "xclip",
}

export enum XclipOption {
  Selection = "-selection",
  Output = "-o",
}

export enum ClipboardSelection {
  Clipboard = "clipboard",
  Primary = "primary",
}

export enum ClipboardEnvironment {
  WaylandDisplay = "WAYLAND_DISPLAY",
  SessionType = "XDG_SESSION_TYPE",
}

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

function commandFor(backend: Exclude<Backend, Backend.Auto>, operation: Operation): string[] {
  switch (backend) {
    case Backend.Native:
      return [operation === Operation.Copy ? ClipboardCommand.PbCopy : ClipboardCommand.PbPaste];
    case Backend.Wayland:
      return [operation === Operation.Copy ? ClipboardCommand.WlCopy : ClipboardCommand.WlPaste];
    case Backend.X11:
      return operation === Operation.Copy
        ? [ClipboardCommand.Xclip, XclipOption.Selection, ClipboardSelection.Clipboard]
        : [
            ClipboardCommand.Xclip,
            XclipOption.Selection,
            ClipboardSelection.Clipboard,
            XclipOption.Output,
          ];
  }
}

export function resolveCommand(
  operation: Operation,
  backend: Backend = Backend.Auto,
  runtime: Runtime = defaultRuntime(),
): string[] {
  const available = (candidate: Exclude<Backend, Backend.Auto>): boolean => {
    const command = commandFor(candidate, operation)[0]!;
    return candidate === Backend.Native
      ? runtime.executable(command)
      : runtime.which(command) !== null;
  };

  if (backend !== Backend.Auto) {
    if (backend === Backend.Native && runtime.platform !== RuntimePlatform.Darwin) {
      throw new Error("native backend is only available on macOS");
    }
    if (!available(backend)) throw new Error(`${backend} clipboard backend is not installed`);
    return commandFor(backend, operation);
  }

  if (runtime.platform === RuntimePlatform.Darwin && available(Backend.Native))
    return commandFor(Backend.Native, operation);
  const wayland =
    Boolean(runtime.env[ClipboardEnvironment.WaylandDisplay]) ||
    runtime.env[ClipboardEnvironment.SessionType]?.toLowerCase() === Backend.Wayland;
  if (wayland && available(Backend.Wayland)) return commandFor(Backend.Wayland, operation);
  if (available(Backend.X11)) return commandFor(Backend.X11, operation);
  const required = wayland ? "wl-clipboard (Wayland) or xclip (X11)" : "xclip (X11)";
  throw new Error(`no clipboard backend found; install ${required}`);
}
