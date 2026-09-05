import { join } from "node:path";
import type { PlatformInstaller } from "./types";

export const darwin: PlatformInstaller = {
  platform: "darwin",
  prepare: "homebrew",
  native: [
    { test: "@brew/git", packages: ["git"] },
    { test: "@brew/curl", packages: ["curl"] },
    { test: "rg", packages: ["ripgrep"] },
    { test: "fd", packages: ["fd"] },
    { test: "bat", packages: ["bat"] },
    { test: "eza", packages: ["eza"] },
    { test: "fzf", packages: ["fzf"] },
    { test: "lsof", packages: ["lsof"] },
    { test: "jq", packages: ["jq"] },
    { test: "delta", packages: ["git-delta"] },
    { test: "gh", packages: ["gh"] },
    { test: "btm", packages: ["bottom"] },
    { test: "hx", packages: ["helix"] },
    { test: "taplo", packages: ["taplo"] },
    { test: "go", packages: ["go"] },
    { test: "aws", packages: ["awscli"] },
    { test: "onefetch", packages: ["onefetch"] },
    { test: "tokei", packages: ["tokei"] },
    { test: "usql", packages: ["xo/xo/usql"] },
    { test: "terraform", packages: ["hashicorp/tap/terraform"] },
    { test: "terraform-ls", packages: ["hashicorp/tap/terraform-ls"] },
    { test: "@brew/zsh-autosuggestions", packages: ["zsh-autosuggestions"] },
    { test: "@brew/zsh-syntax-highlighting", packages: ["zsh-syntax-highlighting"] },
  ],
  nativeCommands(packages, context) {
    const commands =
      packages.length > 0 ? [{ name: "brew", command: ["brew", "install", ...packages] }] : [];
    const userFont = join(context.home, "Library/Fonts/JetBrainsMonoNerdFont-Regular.ttf");
    if (
      !context.exists(userFont) &&
      !context.exists("/Library/Fonts/JetBrainsMonoNerdFont-Regular.ttf")
    ) {
      commands.push({
        name: "font",
        command: ["brew", "install", "--cask", "font-jetbrains-mono-nerd-font"],
      });
    }
    return commands;
  },
  releases: [],
};
