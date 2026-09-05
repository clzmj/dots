import type { PlatformInstaller } from "./types";

export const arch: PlatformInstaller = {
  platform: "arch",
  native: [
    { test: "cc", packages: ["gcc"] },
    { test: "zsh", packages: ["zsh"] },
    { test: "git", packages: ["git"] },
    { test: "curl", packages: ["curl"] },
    { test: "rg", packages: ["ripgrep"] },
    { test: "fd", packages: ["fd"] },
    { test: "bat", packages: ["bat"] },
    { test: "eza", packages: ["eza"] },
    { test: "fzf", packages: ["fzf"] },
    { test: "lsof", packages: ["lsof"] },
    { test: "wl-copy", packages: ["wl-clipboard"] },
    { test: "jq", packages: ["jq"] },
    { test: "delta", packages: ["git-delta"] },
    { test: "tokei", packages: ["tokei"] },
    { test: "onefetch", packages: ["onefetch"] },
    { test: "helix", packages: ["helix"] },
    { test: "btm", packages: ["bottom"] },
    { test: "go", packages: ["go"] },
    { test: "gh", packages: ["github-cli"] },
    { test: "taplo", packages: ["taplo"] },
    { test: "xclip", packages: ["xclip"] },
    { test: "unzip", packages: ["unzip"] },
    { test: "xz", packages: ["xz"] },
    {
      test: "/usr/share/zsh/plugins/zsh-autosuggestions/zsh-autosuggestions.plugin.zsh",
      packages: ["zsh-autosuggestions"],
    },
    {
      test: "/usr/share/zsh/plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.plugin.zsh",
      packages: ["zsh-syntax-highlighting"],
    },
  ],
  nativeCommands(packages, _context, elevate) {
    if (packages.length === 0) return [];
    return [
      {
        name: "pacman install",
        command: elevate(["pacman", "-S", "--needed", "--noconfirm", ...packages]),
      },
    ];
  },
  releases: [],
};
