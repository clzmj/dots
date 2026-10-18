import { EnvironmentKey, Executable, MachineArchitecture } from "../src/lib/tokens";
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Command, CommandResult, CommandRunner } from "../src/lib/process";
import {
  detectArchitecture,
  detectPlatform,
  installPackages,
  nativePackagesFor,
  Platform,
  OperatingSystem,
  platformFromEnvironment,
} from "../src/packages";

describe("package inventory", () => {
  test("detects supported platforms without probing the host", () => {
    expect(detectPlatform(OperatingSystem.Darwin)).toBe(Platform.Darwin);
    expect(detectPlatform(OperatingSystem.Linux, { apt: true, dnf: false, pacman: false })).toBe(
      Platform.Debian,
    );
    expect(detectPlatform(OperatingSystem.Linux, { apt: false, dnf: true, pacman: false })).toBe(
      Platform.Fedora,
    );
    expect(detectPlatform(OperatingSystem.Linux, { apt: false, dnf: false, pacman: true })).toBe(
      Platform.Arch,
    );
  });

  test("maps release architectures", () => {
    expect(detectArchitecture(MachineArchitecture.X64)).toEqual({
      deb: MachineArchitecture.Amd64,
      rpm: MachineArchitecture.X86_64,
      release: MachineArchitecture.X86_64,
      short: MachineArchitecture.X64,
    });
    expect(detectArchitecture(MachineArchitecture.Arm64)).toEqual({
      deb: MachineArchitecture.Arm64,
      rpm: MachineArchitecture.Aarch64,
      release: MachineArchitecture.Aarch64,
      short: MachineArchitecture.Arm64,
    });
  });

  test("accepts an explicit Docker platform and rejects typos", () => {
    expect(
      platformFromEnvironment({ [EnvironmentKey.DockerPlatform]: "fedora" }, () => Platform.Debian),
    ).toBe(Platform.Fedora);
    expect(platformFromEnvironment({}, () => Platform.Arch)).toBe(Platform.Arch);
    expect(() => platformFromEnvironment({ [EnvironmentKey.DockerPlatform]: "ubuntu" })).toThrow(
      "invalid DOTS_DOCKER_PLATFORM",
    );
  });

  test("retains platform-specific package traps", () => {
    const debian = nativePackagesFor(Platform.Debian);
    expect(debian.find((entry) => entry.test === "delta")?.packages).toEqual(["git-delta"]);
    expect(debian.some((entry) => entry.test === Executable.Fd)).toBe(false);
    expect(debian.some((entry) => entry.test === Executable.Bat)).toBe(false);
    expect(nativePackagesFor(Platform.Arch).find((entry) => entry.test === "gh")?.packages).toEqual(
      ["github-cli"],
    );
    expect(
      nativePackagesFor(Platform.Fedora).find((entry) => entry.test === Executable.Fd)?.packages,
    ).toEqual(["fd-find"]);
  });

  for (const platform of Object.values(Platform)) {
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

  test("does not install deprecated Lemonaid globals", async () => {
    const report = await installPackages({
      platform: Platform.Darwin,
      home: "/tmp/dots-package-plan",
      dryRun: true,
      exists: () => true,
      log: () => {},
      warn: () => {},
    });
    expect(report.planned.some((line) => line.includes("@lemonaid-dev/"))).toBe(false);
  });

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
        platform: Platform.Debian,
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
