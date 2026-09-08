import { describe, expect, test } from "bun:test";

import {
  OpenBackendError,
  openTargets,
  resolveOpenBackend,
  type SpawnedProcess,
} from "../src/index.ts";

const none = () => null;

describe("resolveOpenBackend", () => {
  test("uses the native macOS opener without PATH recursion", () => {
    expect(resolveOpenBackend({ platform: "darwin", executable: () => true }).command).toEqual([
      "/usr/bin/open",
    ]);
    expect(() => resolveOpenBackend({ platform: "darwin", executable: () => false })).toThrow(
      OpenBackendError,
    );
  });

  test("prefers wslview under WSL", () => {
    const backend = resolveOpenBackend({
      platform: "linux",
      env: { WSL_DISTRO_NAME: "Ubuntu" },
      which: (name) => (name === "wslview" ? "/usr/bin/wslview" : null),
    });
    expect(backend).toEqual({ name: "wslview", command: ["/usr/bin/wslview"] });
  });

  test("uses xdg-open then gio on Linux", () => {
    expect(
      resolveOpenBackend({
        platform: "linux",
        env: {},
        which: (name) => (name === "xdg-open" ? "/usr/bin/xdg-open" : null),
      }).name,
    ).toBe("xdg-open");
    expect(
      resolveOpenBackend({
        platform: "linux",
        env: {},
        which: (name) => (name === "gio" ? "/usr/bin/gio" : null),
      }).command,
    ).toEqual(["/usr/bin/gio", "open"]);
    expect(() => resolveOpenBackend({ platform: "linux", env: {}, which: none })).toThrow(
      "no opener found",
    );
  });

  test("uses an argv-safe Windows executable rather than cmd.exe", () => {
    expect(resolveOpenBackend({ platform: "win32", which: none })).toEqual({
      name: "explorer",
      command: ["explorer.exe"],
    });
  });

  test("rejects unsupported platforms", () => {
    expect(() => resolveOpenBackend({ platform: "aix", which: none })).toThrow(
      "unsupported platform",
    );
  });
});

describe("openTargets", () => {
  test("opens targets in order and preserves spaces and shell metacharacters as argv", async () => {
    const commands: string[][] = [];
    const spawn = (command: readonly string[]): SpawnedProcess => {
      commands.push([...command]);
      return { exited: Promise.resolve(0) };
    };
    expect(
      await openTargets(["a file.txt", "https://example.test/?q=$(false)"], {
        platform: "linux",
        env: {},
        which: (name) => (name === "xdg-open" ? "/mock/xdg-open" : null),
        spawn,
      }),
    ).toBe(0);
    expect(commands).toEqual([
      ["/mock/xdg-open", "a file.txt"],
      ["/mock/xdg-open", "https://example.test/?q=$(false)"],
    ]);
  });

  test("stops at and returns the first backend failure", async () => {
    const statuses = [0, 19, 0];
    let calls = 0;
    const status = await openTargets(["one", "two", "three"], {
      platform: "linux",
      env: {},
      which: (name) => (name === "xdg-open" ? name : null),
      spawn: () => ({ exited: Promise.resolve(statuses[calls++] ?? 0) }),
    });
    expect(status).toBe(19);
    expect(calls).toBe(2);
  });

  test("requires a target", async () => {
    await expect(openTargets([])).rejects.toThrow("at least one target");
  });
});
