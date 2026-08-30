import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  detectArchitecture,
  detectPlatform,
  installPackages,
  nativePackagesFor,
  platformFromEnvironment,
  type Platform,
} from "../src/packages";
import type { Command, CommandResult, CommandRunner } from "../src/lib/process";

describe("package inventory", () => {
  test("detects supported platforms without probing the host", () => {
    expect(detectPlatform("darwin")).toBe("darwin");
    expect(detectPlatform("linux", { apt: true, dnf: false, pacman: false })).toBe("debian");
    expect(detectPlatform("linux", { apt: false, dnf: true, pacman: false })).toBe("fedora");
    expect(detectPlatform("linux", { apt: false, dnf: false, pacman: true })).toBe("arch");
  });

  test("maps release architectures", () => {
    expect(detectArchitecture("x64")).toEqual({
      deb: "amd64",
      rpm: "x86_64",
      release: "x86_64",
      short: "x64",
    });
    expect(detectArchitecture("arm64")).toEqual({
      deb: "arm64",
      rpm: "aarch64",
      release: "aarch64",
      short: "arm64",
    });
  });

  test("accepts an explicit Docker platform and rejects typos", () => {
    expect(platformFromEnvironment({ DOTS_DOCKER_PLATFORM: "fedora" }, () => "debian")).toBe(
      "fedora",
    );
    expect(platformFromEnvironment({}, () => "arch")).toBe("arch");
    expect(() => platformFromEnvironment({ DOTS_DOCKER_PLATFORM: "ubuntu" })).toThrow(
      "invalid DOTS_DOCKER_PLATFORM",
    );
  });

  test("retains platform-specific package traps", () => {
    const debian = nativePackagesFor("debian");
    expect(debian.find((entry) => entry.test === "delta")?.packages).toEqual(["git-delta"]);
    expect(debian.some((entry) => entry.test === "fd")).toBe(false);
    expect(debian.some((entry) => entry.test === "bat")).toBe(false);
    expect(nativePackagesFor("arch").find((entry) => entry.test === "gh")?.packages).toEqual([
      "github-cli",
    ]);
    expect(nativePackagesFor("fedora").find((entry) => entry.test === "fd")?.packages).toEqual([
      "fd-find",
    ]);
  });

  for (const platform of ["debian", "fedora", "arch", "darwin"] as Platform[]) {
    test(`${platform} dry-run plans without touching disk or network`, async () => {
      const parent = await mkdtemp(join(tmpdir(), "dots-packages-test-"));
      const home = join(parent, "missing-home");
      try {
        const report = await installPackages({
          platform,
          home,
          dryRun: true,
          exists: () => false,
          log: () => {},
          warn: () => {},
        });
        expect(existsSync(home)).toBe(false);
        expect(report.failures).toHaveLength(0);
        expect(report.planned.length).toBeGreaterThan(5);
        const native = report.planned.findIndex((line) =>
          /apt install|dnf install|pacman install|brew install/.test(line),
        );
        const vendor = report.planned.findIndex((line) => line.startsWith("claude:"));
        expect(native).toBeGreaterThanOrEqual(0);
        expect(vendor).toBeGreaterThan(native);
      } finally {
        await rm(parent, { recursive: true, force: true });
      }
    });
  }

  test("failed apt update blocks apt install and every dependent stage", async () => {
    const home = await mkdtemp(join(tmpdir(), "dots-packages-failure-"));
    const commands: Command[] = [];
    const runner: CommandRunner = {
      async run(command): Promise<CommandResult> {
        commands.push(command);
        return { command, exitCode: 9, stdout: "", stderr: "offline", durationMs: 0 };
      },
    };
    try {
      const report = await installPackages({
        platform: "debian",
        home,
        runner,
        exists: () => false,
        log: () => {},
        warn: () => {},
      });
      expect(report.failures).toHaveLength(1);
      expect(commands).toHaveLength(1);
      expect(commands.at(0)?.join(" ")).toContain("apt-get update -qq");
      expect(report.planned.some((line) => line.startsWith("claude:"))).toBe(false);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
