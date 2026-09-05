import type { Command } from "../../lib/process";
import type { Architecture, PackageContext, Platform } from "../types";

export interface NativePackage {
  test: string;
  packages: string[];
}

export interface NamedCommand {
  name: string;
  command: Command;
}

export interface Release {
  tag: string;
  version: string;
}

interface ReleaseBase {
  test: string;
  name: string;
  phase: "serial" | "parallel";
}

type AssetSelector = (release: Release, arch: Architecture) => string;

export type PlatformRelease = ReleaseBase &
  (
    | { kind: "deb"; repo: string; asset: AssetSelector }
    | { kind: "rpm-bottom" }
    | { kind: "tar" | "binary"; repo: string; asset: AssetSelector; binary: string }
    | { kind: "helix" | "go" }
  );

export interface PlatformInstaller {
  platform: Platform;
  prepare?: "homebrew";
  native: NativePackage[];
  nativeCommands(
    packages: string[],
    context: PackageContext,
    elevate: (command: Command) => Command,
  ): NamedCommand[];
  releases: PlatformRelease[];
}
