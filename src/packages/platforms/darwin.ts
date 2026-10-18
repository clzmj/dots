import { PackageName, CommandVerb, Executable, HomebrewPath, PackageFlag } from "../../lib/tokens";
import { join } from "node:path";
import { Platform } from "../types";
import { PlatformPreparation, type NamedCommand, type PlatformInstaller } from "./types";

export const darwin: PlatformInstaller = {
  platform: Platform.Darwin,
  prepare: PlatformPreparation.Homebrew,
  native: [
    { test: HomebrewPath.Git, packages: [PackageName.Git] },
    { test: HomebrewPath.Curl, packages: [PackageName.Curl] },
    { test: Executable.Ripgrep, packages: [PackageName.Ripgrep] },
    { test: Executable.Fd, packages: [PackageName.Fd] },
    { test: Executable.Bat, packages: [PackageName.Bat] },
    { test: Executable.Eza, packages: [PackageName.Eza] },
    { test: Executable.Fzf, packages: [PackageName.Fzf] },
    { test: Executable.Lsof, packages: [PackageName.Lsof] },
    { test: Executable.Jq, packages: [PackageName.Jq] },
    { test: Executable.Delta, packages: [PackageName.GitDelta] },
    { test: Executable.GitHub, packages: [PackageName.GitHub] },
    { test: Executable.Bottom, packages: [PackageName.Bottom] },
    { test: Executable.Hx, packages: [PackageName.Helix] },
    { test: Executable.Taplo, packages: [PackageName.Taplo] },
    { test: Executable.Go, packages: [PackageName.Go] },
    { test: Executable.Aws, packages: [PackageName.AwsCli] },
    { test: Executable.Onefetch, packages: [PackageName.Onefetch] },
    { test: Executable.Tokei, packages: [PackageName.Tokei] },
    { test: Executable.Usql, packages: [PackageName.Usql] },
    { test: Executable.Terraform, packages: [PackageName.Terraform] },
    { test: Executable.TerraformLanguageServer, packages: [PackageName.TerraformLanguageServer] },
    { test: HomebrewPath.Autosuggestions, packages: [PackageName.ZshAutosuggestions] },
    { test: HomebrewPath.SyntaxHighlighting, packages: [PackageName.ZshSyntaxHighlighting] },
  ],
  nativeCommands(packages, context): NamedCommand[] {
    const commands: NamedCommand[] =
      packages.length > 0
        ? [{ name: Executable.Brew, command: [Executable.Brew, CommandVerb.Install, ...packages] }]
        : [];
    const userFont = join(context.home, "Library/Fonts/JetBrainsMonoNerdFont-Regular.ttf");
    if (
      !context.exists(userFont) &&
      !context.exists("/Library/Fonts/JetBrainsMonoNerdFont-Regular.ttf")
    ) {
      commands.push({
        name: "font",
        command: [
          Executable.Brew,
          CommandVerb.Install,
          PackageFlag.Cask,
          PackageName.JetBrainsMonoNerdFont,
        ],
      });
    }
    return commands;
  },
  releases: [],
};
