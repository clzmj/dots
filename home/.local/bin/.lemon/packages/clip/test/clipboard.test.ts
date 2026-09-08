import { describe, expect, test } from "bun:test";

import { resolveCommand, type Runtime } from "../src/backend";
import { parseArgs } from "../src/process";

function runtime(options: Partial<Runtime> = {}): Runtime {
  return {
    platform: "linux",
    env: {},
    which: () => null,
    executable: () => false,
    ...options,
  };
}

describe("backend selection", () => {
  test("uses native commands on macOS", () => {
    const mac = runtime({ platform: "darwin", executable: () => true });
    expect(resolveCommand("copy", "auto", mac)).toEqual(["/usr/bin/pbcopy"]);
    expect(resolveCommand("paste", "auto", mac)).toEqual(["/usr/bin/pbpaste"]);
  });

  test("prefers Wayland and falls back to X11", () => {
    const both = runtime({
      env: { WAYLAND_DISPLAY: "wayland-0" },
      which: (name) =>
        name === "wl-copy" || name === "wl-paste" || name === "xclip" ? name : null,
    });
    expect(resolveCommand("copy", "auto", both)).toEqual(["wl-copy"]);
    expect(resolveCommand("paste", "auto", both)).toEqual(["wl-paste"]);
    const x11 = runtime({ which: (name) => (name === "xclip" ? name : null) });
    expect(resolveCommand("copy", "auto", x11)).toEqual(["xclip", "-selection", "clipboard"]);
    expect(resolveCommand("paste", "auto", x11)).toEqual([
      "xclip",
      "-selection",
      "clipboard",
      "-o",
    ]);
  });

  test("validates explicit backends", () => {
    expect(() => resolveCommand("copy", "native", runtime())).toThrow("only available on macOS");
    expect(() => resolveCommand("copy", "wayland", runtime())).toThrow("not installed");
    expect(() => parseArgs(["--backend", "bogus"])).toThrow("invalid backend");
  });
});

test("parses wrapper options and preserves backend arguments", () => {
  expect(parseArgs(["--backend=x11", "-selection", "primary"])).toEqual({
    action: "run",
    backend: "x11",
    backendArgs: ["-selection", "primary"],
  });
  expect(parseArgs(["--", "--help"])).toMatchObject({ action: "run", backendArgs: ["--help"] });
});

test("both operations expose help and reject an invalid override", async () => {
  for (const operation of ["copy", "paste"]) {
    for (const option of ["--help", "--version"]) {
      const child = Bun.spawn(["bun", "src/cli.ts", operation, option], {
        cwd: import.meta.dir + "/..",
      });
      expect(await child.exited).toBe(0);
    }
    const child = Bun.spawn(["bun", "src/cli.ts", operation, "--backend", "invalid"], {
      cwd: import.meta.dir + "/..",
      stderr: "pipe",
    });
    expect(await child.exited).not.toBe(0);
  }
});
