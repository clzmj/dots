import { describe, expect, test } from "bun:test";

import {
  OpenBackendError,
  OpenBackendName,
  OpenEnvironment,
  SupportedPlatform,
  openTargets,
  resolveOpenBackend,
  type SpawnedProcess,
} from "../src/index.ts";

const none = () => null;

describe("resolveOpenBackend", () => {
  test("uses the native macOS opener without PATH recursion", () => {
    expect(
      resolveOpenBackend({ platform: SupportedPlatform.Darwin, executable: () => true }).command,
    ).toEqual(["/usr/bin/open"]);
    expect(() =>
      resolveOpenBackend({ platform: SupportedPlatform.Darwin, executable: () => false }),
    ).toThrow(OpenBackendError);
  });

  test("prefers wslview under WSL", () => {
    const backend = resolveOpenBackend({
      platform: SupportedPlatform.Linux,
      env: { [OpenEnvironment.WslDistroName]: "Ubuntu" },
      which: (name) => (name === OpenBackendName.Wslview ? "/usr/bin/wslview" : null),
    });
    expect(backend).toEqual({ name: OpenBackendName.Wslview, command: ["/usr/bin/wslview"] });
  });

  test("uses xdg-open then gio on Linux", () => {
    expect(
      resolveOpenBackend({
        platform: SupportedPlatform.Linux,
        env: {},
        which: (name) => (name === OpenBackendName.XdgOpen ? "/usr/bin/xdg-open" : null),
      }).name,
    ).toBe(OpenBackendName.XdgOpen);
    expect(
      resolveOpenBackend({
        platform: SupportedPlatform.Linux,
        env: {},
        which: (name) => (name === OpenBackendName.Gio ? "/usr/bin/gio" : null),
      }).command,
    ).toEqual(["/usr/bin/gio", "open"]);
    expect(() =>
      resolveOpenBackend({ platform: SupportedPlatform.Linux, env: {}, which: none }),
    ).toThrow("no opener found");
  });

  test("uses an argv-safe Windows executable rather than cmd.exe", () => {
    expect(resolveOpenBackend({ platform: SupportedPlatform.Windows, which: none })).toEqual({
      name: OpenBackendName.Explorer,
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
        platform: SupportedPlatform.Linux,
        env: {},
        which: (name) => (name === OpenBackendName.XdgOpen ? "/mock/xdg-open" : null),
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
      platform: SupportedPlatform.Linux,
      env: {},
      which: (name) => (name === OpenBackendName.XdgOpen ? name : null),
      spawn: () => ({ exited: Promise.resolve(statuses[calls++] ?? 0) }),
    });
    expect(status).toBe(19);
    expect(calls).toBe(2);
  });

  test("requires a target", async () => {
    await expect(openTargets([])).rejects.toThrow("at least one target");
  });
});
