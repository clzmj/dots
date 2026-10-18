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

export const fedora: PlatformInstaller = {
  platform: Platform.Fedora,
  native: [
    { test: Executable.CCompiler, packages: [PackageName.Gcc] },
    { test: Executable.Zsh, packages: [PackageName.Zsh] },
    { test: Executable.Git, packages: [PackageName.Git] },
    { test: Executable.Curl, packages: [PackageName.Curl] },
    { test: Executable.Ripgrep, packages: [PackageName.Ripgrep] },
    { test: Executable.Fd, packages: [PackageName.FdFind] },
    { test: Executable.Bat, packages: [PackageName.Bat] },
    { test: Executable.Eza, packages: [PackageName.Eza] },
    { test: Executable.Fzf, packages: [PackageName.Fzf] },
    { test: Executable.Lsof, packages: [PackageName.Lsof] },
    { test: Executable.WlCopy, packages: [PackageName.WlClipboard] },
    { test: Executable.Jq, packages: [PackageName.Jq] },
    { test: Executable.Delta, packages: [PackageName.GitDelta] },
    { test: Executable.Tokei, packages: [PackageName.Tokei] },
    { test: Executable.Onefetch, packages: [PackageName.Onefetch] },
    { test: Executable.Hx, packages: [PackageName.Helix] },
    { test: Executable.Go, packages: [PackageName.Golang] },
    { test: Executable.GitHub, packages: [PackageName.GitHub] },
    { test: Executable.Xclip, packages: [PackageName.Xclip] },
    { test: Executable.Unzip, packages: [PackageName.Unzip] },
    { test: Executable.Xz, packages: [PackageName.Xz] },
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
        name: "dnf install",
        command: elevate([
          Executable.Dnf,
          CommandVerb.Install,
          PackageFlag.Yes,
          PackageFlag.AllowErasing,
          ...packages,
        ]),
      },
    ];
  },
  releases: [
    {
      test: Executable.Bottom,
      name: PackageTaskName.Bottom,
      kind: ReleaseKind.RpmBottom,
      phase: ReleasePhase.Serial,
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
  ],
};
