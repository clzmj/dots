import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { formatDuration } from "../home/.local/bin/notify";
import { openCommand } from "../home/.local/bin/open";
import { copyCommand } from "../home/.local/bin/pbcopy";
import { pasteCommand } from "../home/.local/bin/pbpaste";
import { ignored } from "../home/.local/bin/tree";
import { forgePath, normalizeRemote } from "../home/.local/bin/www";
import { blameUrls } from "../home/.local/bin/blame-menu";
import { parseLsof, parseSelection, stopProcesses } from "../home/.local/bin/kserver";

const temporary: string[] = [];
const originalSignalHook = process.env.DOTS_KSERVER_SIGNAL_COMMAND;

afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
  if (originalSignalHook === undefined) delete process.env.DOTS_KSERVER_SIGNAL_COMMAND;
  else process.env.DOTS_KSERVER_SIGNAL_COMMAND = originalSignalHook;
});

function tempDirectory() {
  const path = mkdtempSync(join(tmpdir(), "dots-helpers-"));
  temporary.push(path);
  return path;
}

describe("small helper commands", () => {
  test("formats notification durations", () => {
    expect(formatDuration(999)).toBe("0s");
    expect(formatDuration(65_900)).toBe("1m 5s");
    expect(formatDuration(7_501_000)).toBe("2h 5m");
  });

  test("selects native and Linux open/clipboard commands", () => {
    expect(openCommand("linux")).toEqual(["xdg-open"]);
    const both = (name: string) =>
      name === "wl-copy" || name === "wl-paste" || name === "xclip" ? `/mock/${name}` : null;
    expect(copyCommand("linux", both, { WAYLAND_DISPLAY: "wayland-0" })).toEqual(["wl-copy"]);
    expect(pasteCommand("linux", both, { XDG_SESSION_TYPE: "wayland" })).toEqual(["wl-paste"]);
    expect(copyCommand("linux", both, { XDG_SESSION_TYPE: "x11" })).toEqual([
      "xclip",
      "-selection",
      "clipboard",
    ]);
    expect(pasteCommand("linux", both, {})).toEqual(["xclip", "-selection", "clipboard", "-o"]);
  });

  test("keeps the standard tree exclusions", () => {
    expect(ignored).toContain("node_modules");
    expect(ignored).toContain(".git");
    expect(ignored).toContain("target");
  });

  test("normalizes forge remotes and builds provider URLs", () => {
    expect(normalizeRemote("git@github.com:acme/widgets.git")).toBe(
      "https://github.com/acme/widgets",
    );
    expect(normalizeRemote("ssh://git@gitlab.example/acme/widgets.git")).toBe(
      "https://gitlab.example/acme/widgets",
    );
    expect(forgePath("https://github.com/acme/widgets", "main", "src/a file.ts")).toBe(
      "https://github.com/acme/widgets/tree/main/src/a%20file.ts",
    );
    expect(forgePath("https://gitlab.example/acme/widgets", "main", "src")).toBe(
      "https://gitlab.example/acme/widgets/-/tree/main/src",
    );
  });

  test("builds GitHub and GitLab blame links", () => {
    const github = blameUrls(
      "https://github.com/acme/widgets",
      "abc1234",
      "main",
      "src/a file.ts",
      7,
    );
    expect(github.lineCommit).toBe(
      "https://github.com/acme/widgets/blob/abc1234/src/a%20file.ts#L7",
    );
    const gitlab = blameUrls(
      "https://gitlab.example/acme/widgets",
      "abc1234",
      "main",
      "src/a.ts",
      7,
    );
    expect(gitlab.commit).toBe("https://gitlab.example/acme/widgets/-/commit/abc1234");
  });
});

describe("kserver", () => {
  test("parses machine-readable lsof output and deduplicates ports", () => {
    expect(
      parseLsof("p4001\ncnode\nn*:3000\nn127.0.0.1:3000\np4002\ncpython3\nn[::1]:8000\n"),
    ).toEqual([
      { pid: 4001, name: "node", ports: [3000] },
      { pid: 4002, name: "python3", ports: [8000] },
    ]);
  });

  test("accepts multi-selection, ranges, and all", () => {
    expect(parseSelection("1, 3-4", 4)).toEqual([0, 2, 3]);
    expect(parseSelection("all", 3)).toEqual([0, 1, 2]);
    expect(() => parseSelection("0", 3)).toThrow("out of range");
    expect(() => parseSelection("3-1", 3)).toThrow("invalid range");
  });

  test("TERM and KILL phases use a mock signal process, never real PIDs", async () => {
    const dir = tempDirectory();
    const log = join(dir, "signals.log");
    const hook = join(dir, "signal-hook");
    await Bun.write(hook, `#!/bin/sh\nprintf '%s %s\\n' "$1" "$2" >> '${log}'\nexit 0\n`);
    chmodSync(hook, 0o755);
    process.env.DOTS_KSERVER_SIGNAL_COMMAND = hook;

    const survivors = await stopProcesses([424201, 424202], 0);
    expect(survivors).toEqual([424201, 424202]);
    const calls = (await Bun.file(log).text()).trim().split("\n").sort();
    expect(calls).toContain("SIGTERM 424201");
    expect(calls).toContain("SIGTERM 424202");
    expect(calls).toContain("SIGKILL 424201");
    expect(calls).toContain("SIGKILL 424202");
    expect(calls.filter((line) => line.startsWith("0 "))).toHaveLength(4);
  });

  test("refuses self and special PIDs before signaling", async () => {
    await expect(stopProcesses([process.pid], 0)).rejects.toThrow("unsafe PID");
    await expect(stopProcesses([1], 0)).rejects.toThrow("unsafe PID");
  });
});
