import { PackageName, Executable, PackageFlag } from "../../lib/tokens";
import { Platform } from "../types";
import type { PlatformInstaller } from "./types";

export const arch: PlatformInstaller = {
  platform: Platform.Arch,
  native: [
    { test: Executable.CCompiler, packages: [PackageName.Gcc] },
    { test: Executable.Zsh, packages: [PackageName.Zsh] },
    { test: Executable.Git, packages: [PackageName.Git] },
    { test: Executable.Curl, packages: [PackageName.Curl] },
    { test: Executable.Ripgrep, packages: [PackageName.Ripgrep] },
    { test: Executable.Fd, packages: [PackageName.Fd] },
    { test: Executable.Bat, packages: [PackageName.Bat] },
    { test: Executable.Eza, packages: [PackageName.Eza] },
    { test: Executable.Fzf, packages: [PackageName.Fzf] },
    { test: Executable.Lsof, packages: [PackageName.Lsof] },
    { test: Executable.WlCopy, packages: [PackageName.WlClipboard] },
    { test: Executable.Jq, packages: [PackageName.Jq] },
    { test: Executable.Delta, packages: [PackageName.GitDelta] },
    { test: Executable.Tokei, packages: [PackageName.Tokei] },
    { test: Executable.Onefetch, packages: [PackageName.Onefetch] },
    { test: Executable.Helix, packages: [PackageName.Helix] },
    { test: Executable.Bottom, packages: [PackageName.Bottom] },
    { test: Executable.Go, packages: [PackageName.Go] },
    { test: Executable.GitHub, packages: [PackageName.GitHubCli] },
    { test: Executable.Taplo, packages: [PackageName.Taplo] },
    { test: Executable.Xclip, packages: [PackageName.Xclip] },
    { test: Executable.Unzip, packages: [PackageName.Unzip] },
    { test: Executable.Xz, packages: [PackageName.Xz] },
    {
      test: "/usr/share/zsh/plugins/zsh-autosuggestions/zsh-autosuggestions.plugin.zsh",
      packages: [PackageName.ZshAutosuggestions],
    },
    {
      test: "/usr/share/zsh/plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.plugin.zsh",
      packages: [PackageName.ZshSyntaxHighlighting],
    },
  ],
  nativeCommands(packages, _context, elevate) {
    if (packages.length === 0) return [];
    return [
      {
        name: "pacman install",
        command: elevate([
          Executable.Pacman,
          PackageFlag.Sync,
          PackageFlag.Needed,
          PackageFlag.NoConfirm,
          ...packages,
        ]),
      },
    ];
  },
  releases: [],
};
