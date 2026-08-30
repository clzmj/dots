import { afterEach, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const root = dirname(dirname(import.meta.path));
const temporary: string[] = [];

afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
});

test("tree streams child output and preserves its exit status", async () => {
  const bin = mkdtempSync(join(tmpdir(), "dots-helper-path-"));
  temporary.push(bin);
  const eza = join(bin, "eza");
  await Bun.write(eza, "#!/bin/sh\nprintf 'mock-eza:%s\\n' \"$*\"\nexit 23\n");
  chmodSync(eza, 0o755);

  const child = Bun.spawn([join(root, "home/.local/bin/tree"), "demo"], {
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = await new Response(child.stdout).text();
  expect(await child.exited).toBe(23);
  expect(output).toContain("mock-eza:--tree --all --git --ignore-glob");
  expect(output).toContain("demo");
});

test("notify streams output and reports a failed status while preserving compatibility", async () => {
  const bin = mkdtempSync(join(tmpdir(), "dots-helper-path-"));
  temporary.push(bin);
  const command = join(bin, "fails");
  await Bun.write(command, "#!/bin/sh\necho child-output\nexit 9\n");
  chmodSync(command, 0o755);

  const child = Bun.spawn([join(root, "home/.local/bin/notify"), command], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = await new Response(child.stdout).text();
  expect(await child.exited).toBe(0);
  expect(output).toContain("child-output");
  expect(output).toContain("Failed (status: 9)");
});

if (process.platform !== "darwin") {
  test("open streams diagnostics and preserves xdg-open status", async () => {
    const bin = mkdtempSync(join(tmpdir(), "dots-helper-path-"));
    temporary.push(bin);
    const command = join(bin, "xdg-open");
    await Bun.write(command, "#!/bin/sh\necho opening:$1\necho diagnostic >&2\nexit 19\n");
    chmodSync(command, 0o755);

    const child = Bun.spawn([join(root, "home/.local/bin/open"), "https://example.test/a"], {
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, status] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(status).toBe(19);
    expect(stdout).toContain("opening:https://example.test/a");
    expect(stderr).toContain("diagnostic");
  });

  test("pbcopy and pbpaste stream data and preserve backend status", async () => {
    const bin = mkdtempSync(join(tmpdir(), "dots-helper-path-"));
    temporary.push(bin);
    const copy = join(bin, "wl-copy");
    const paste = join(bin, "wl-paste");
    await Bun.write(copy, "#!/bin/sh\ninput=$(cat)\nprintf 'copied:%s' \"$input\"\nexit 21\n");
    await Bun.write(paste, "#!/bin/sh\nprintf 'clipboard-data'\nexit 22\n");
    chmodSync(copy, 0o755);
    chmodSync(paste, 0o755);
    const env = {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      WAYLAND_DISPLAY: "wayland-0",
    };

    const copyChild = Bun.spawn([join(root, "home/.local/bin/pbcopy")], {
      env,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    copyChild.stdin.write("hello clipboard");
    copyChild.stdin.end();
    const copyOutput = await new Response(copyChild.stdout).text();
    expect(await copyChild.exited).toBe(21);
    expect(copyOutput).toBe("copied:hello clipboard");

    const pasteChild = Bun.spawn([join(root, "home/.local/bin/pbpaste")], {
      env,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await new Response(pasteChild.stdout).text()).toBe("clipboard-data");
    expect(await pasteChild.exited).toBe(22);
  });
}
