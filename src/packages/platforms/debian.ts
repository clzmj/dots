import {
  PackageTaskName,
  ReleaseRepository,
  PackageName,
  CommandVerb,
  Executable,
  PackageFlag,
  SystemPath,
} from "../../lib/tokens";
import { Platform } from "../types";
import { ReleaseKind, ReleasePhase, type PlatformInstaller } from "./types";

export const debian: PlatformInstaller = {
  platform: Platform.Debian,
  native: [
    { test: Executable.Zsh, packages: [PackageName.Zsh] },
    { test: Executable.Git, packages: [PackageName.Git] },
    { test: Executable.Curl, packages: [PackageName.Curl] },
    { test: Executable.Ripgrep, packages: [PackageName.Ripgrep] },
    { test: Executable.Eza, packages: [PackageName.Eza] },
    { test: Executable.Fzf, packages: [PackageName.Fzf] },
    { test: Executable.Lsof, packages: [PackageName.Lsof] },
    { test: Executable.WlCopy, packages: [PackageName.WlClipboard] },
    { test: Executable.Jq, packages: [PackageName.Jq] },
    { test: Executable.Delta, packages: [PackageName.GitDelta] },
    { test: Executable.Tokei, packages: [PackageName.Tokei] },
    { test: Executable.Xclip, packages: [PackageName.Xclip] },
    { test: Executable.Unzip, packages: [PackageName.Unzip] },
    { test: Executable.Xz, packages: [PackageName.XzUtils] },
    { test: Executable.CCompiler, packages: [PackageName.BuildEssential] },
    { test: "/usr/share/ca-certificates", packages: [PackageName.CaCertificates] },
    {
      test: SystemPath.Autosuggestions,
      packages: [PackageName.ZshAutosuggestions],
    },
    {
      test: SystemPath.SyntaxHighlighting,
      packages: [PackageName.ZshSyntaxHighlighting],
    },
  ],
  nativeCommands(packages, _context, elevate) {
    if (packages.length === 0) return [];
    return [
      {
        name: "apt update",
        command: elevate([Executable.AptGet, CommandVerb.Update, PackageFlag.Quiet]),
      },
      {
        name: "apt install",
        command: elevate([Executable.AptGet, CommandVerb.Install, PackageFlag.Yes, ...packages]),
      },
    ];
  },
  releases: [
    {
      test: Executable.Fd,
      name: Executable.Fd,
      kind: ReleaseKind.Deb,
      phase: ReleasePhase.Serial,
      repo: ReleaseRepository.Fd,
      asset: ({ version }, arch) => `fd_${version}_${arch.deb}.deb`,
    },
    {
      test: Executable.Bat,
      name: Executable.Bat,
      kind: ReleaseKind.Deb,
      phase: ReleasePhase.Serial,
      repo: ReleaseRepository.Bat,
      asset: ({ version }, arch) => `bat_${version}_${arch.deb}.deb`,
    },
    {
      test: Executable.Bottom,
      name: PackageTaskName.Bottom,
      kind: ReleaseKind.Deb,
      phase: ReleasePhase.Serial,
      repo: ReleaseRepository.Bottom,
      asset: ({ version }, arch) => `bottom_${version}-1_${arch.deb}.deb`,
    },
    {
      test: Executable.GitHub,
      name: Executable.GitHub,
      kind: ReleaseKind.Tar,
      phase: ReleasePhase.Parallel,
      repo: ReleaseRepository.GitHub,
      asset: ({ version }, arch) => `gh_${version}_linux_${arch.deb}.tar.gz`,
      binary: Executable.GitHub,
    },
    {
      test: Executable.Onefetch,
      name: Executable.Onefetch,
      kind: ReleaseKind.Tar,
      phase: ReleasePhase.Parallel,
      repo: ReleaseRepository.Onefetch,
      asset: () => "onefetch-linux.tar.gz",
      binary: Executable.Onefetch,
    },
    {
      test: Executable.Taplo,
      name: Executable.Taplo,
      kind: ReleaseKind.Binary,
      phase: ReleasePhase.Parallel,
      repo: ReleaseRepository.Taplo,
      asset: (_release, arch) => `taplo-linux-${arch.release}.gz`,
      binary: Executable.Taplo,
    },
    {
      test: Executable.Hx,
      name: Executable.Helix,
      kind: ReleaseKind.Helix,
      phase: ReleasePhase.Parallel,
    },
    {
      test: Executable.Go,
      name: Executable.Go,
      kind: ReleaseKind.Go,
      phase: ReleasePhase.Parallel,
    },
  ],
};
