import { PackageTaskName } from "../../lib/tokens";
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

export enum ReleaseKind {
  Deb = "deb",
  RpmBottom = "rpm-bottom",
  Tar = "tar",
  Binary = "binary",
  Helix = "helix",
  Go = "go",
}

export enum ReleasePhase {
  Serial = "serial",
  Parallel = "parallel",
}

export enum PlatformPreparation {
  Homebrew = PackageTaskName.Homebrew,
}

interface ReleaseBase {
  test: string;
  name: string;
  phase: ReleasePhase;
}

type AssetSelector = (release: Release, arch: Architecture) => string;

export type PlatformRelease = ReleaseBase &
  (
    | { kind: ReleaseKind.Deb; repo: string; asset: AssetSelector }
    | { kind: ReleaseKind.RpmBottom }
    | {
        kind: ReleaseKind.Tar | ReleaseKind.Binary;
        repo: string;
        asset: AssetSelector;
        binary: string;
      }
    | { kind: ReleaseKind.Helix | ReleaseKind.Go }
  );

export interface PlatformInstaller {
  platform: Platform;
  prepare?: PlatformPreparation;
  native: NativePackage[];
  nativeCommands(
    packages: string[],
    context: PackageContext,
    elevate: (command: Command) => Command,
  ): NamedCommand[];
  releases: PlatformRelease[];
}
