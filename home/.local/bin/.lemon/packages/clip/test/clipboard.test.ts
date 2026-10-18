import { CliOption, Executable, ProcessIO, RuntimePlatform } from "../../../shared/tokens";
import { describe, expect, test } from "bun:test";

import {
  Backend,
  ClipboardCommand,
  ClipboardEnvironment,
  ClipboardSelection,
  Operation,
  XclipOption,
  resolveCommand,
  type Runtime,
} from "../src/backend";
import { CliAction, parseArgs } from "../src/process";

function runtime(options: Partial<Runtime> = {}): Runtime {
  return {
    platform: RuntimePlatform.Linux,
    env: {},
    which: () => null,
    executable: () => false,
    ...options,
  };
}

describe("backend selection", () => {
  test("uses native commands on macOS", () => {
    const mac = runtime({ platform: RuntimePlatform.Darwin, executable: () => true });
    expect(resolveCommand(Operation.Copy, Backend.Auto, mac)).toEqual(["/usr/bin/pbcopy"]);
    expect(resolveCommand(Operation.Paste, Backend.Auto, mac)).toEqual(["/usr/bin/pbpaste"]);
  });

  test("prefers Wayland and falls back to X11", () => {
    const both = runtime({
      env: { [ClipboardEnvironment.WaylandDisplay]: "wayland-0" },
      which: (name) =>
        name === ClipboardCommand.WlCopy ||
        name === ClipboardCommand.WlPaste ||
        name === ClipboardCommand.Xclip
          ? name
          : null,
    });
    expect(resolveCommand(Operation.Copy, Backend.Auto, both)).toEqual(["wl-copy"]);
    expect(resolveCommand(Operation.Paste, Backend.Auto, both)).toEqual(["wl-paste"]);
    const x11 = runtime({ which: (name) => (name === ClipboardCommand.Xclip ? name : null) });
    expect(resolveCommand(Operation.Copy, Backend.Auto, x11)).toEqual([
      "xclip",
      "-selection",
      "clipboard",
    ]);
    expect(resolveCommand(Operation.Paste, Backend.Auto, x11)).toEqual([
      "xclip",
      "-selection",
      "clipboard",
      "-o",
    ]);
  });

  test("validates explicit backends", () => {
    expect(() => resolveCommand(Operation.Copy, Backend.Native, runtime())).toThrow(
      "only available on macOS",
    );
    expect(() => resolveCommand(Operation.Copy, Backend.Wayland, runtime())).toThrow(
      "not installed",
    );
    expect(() => parseArgs([CliOption.Backend, "bogus"])).toThrow("invalid backend");
  });
});

test("parses wrapper options and preserves backend arguments", () => {
  expect(
    parseArgs([
      `${CliOption.Backend}=${Backend.X11}`,
      XclipOption.Selection,
      ClipboardSelection.Primary,
    ]),
  ).toEqual({
    action: CliAction.Run,
    backend: Backend.X11,
    backendArgs: ["-selection", "primary"],
  });
  expect(parseArgs([CliOption.Separator, CliOption.Help])).toMatchObject({
    action: CliAction.Run,
    backendArgs: [CliOption.Help],
  });
});

test("backend arguments accept every serialized enum value and reject misspellings", () => {
  for (const backend of Object.values(Backend)) {
    expect(parseArgs([CliOption.Backend, backend]).backend).toBe(backend);
    expect(parseArgs([`${CliOption.Backend}=${backend}`]).backend).toBe(backend);
  }
  for (const invalid of ["Auto", "x-11", "native ", ""]) {
    expect(() => parseArgs([`${CliOption.Backend}=${invalid}`])).toThrow("invalid backend");
  }
});

test("both operations expose help and reject an invalid override", async () => {
  for (const operation of [Operation.Copy, Operation.Paste]) {
    for (const option of [CliOption.Help, CliOption.Version]) {
      const child = Bun.spawn([Executable.Bun, "src/cli.ts", operation, option], {
        cwd: import.meta.dir + "/..",
      });
      expect(await child.exited).toBe(0);
    }
    const child = Bun.spawn(
      [Executable.Bun, "src/cli.ts", operation, CliOption.Backend, "invalid"],
      {
        cwd: import.meta.dir + "/..",
        stderr: ProcessIO.Pipe,
      },
    );
    expect(await child.exited).not.toBe(0);
  }
});
