import type { PlatformInstaller } from "./types";

export const fedora: PlatformInstaller = {
  platform: "fedora",
  native: [
    { test: "cc", packages: ["gcc"] },
    { test: "zsh", packages: ["zsh"] },
    { test: "git", packages: ["git"] },
    { test: "curl", packages: ["curl"] },
    { test: "rg", packages: ["ripgrep"] },
    { test: "fd", packages: ["fd-find"] },
    { test: "bat", packages: ["bat"] },
    { test: "eza", packages: ["eza"] },
    { test: "fzf", packages: ["fzf"] },
    { test: "lsof", packages: ["lsof"] },
    { test: "wl-copy", packages: ["wl-clipboard"] },
    { test: "jq", packages: ["jq"] },
    { test: "delta", packages: ["git-delta"] },
    { test: "tokei", packages: ["tokei"] },
    { test: "onefetch", packages: ["onefetch"] },
    { test: "hx", packages: ["helix"] },
    { test: "go", packages: ["golang"] },
    { test: "gh", packages: ["gh"] },
    { test: "xclip", packages: ["xclip"] },
    { test: "unzip", packages: ["unzip"] },
    { test: "xz", packages: ["xz"] },
    {
      test: "/usr/share/zsh-autosuggestions/zsh-autosuggestions.zsh",
      packages: ["zsh-autosuggestions"],
    },
    {
      test: "/usr/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh",
      packages: ["zsh-syntax-highlighting"],
    },
  ],
  nativeCommands(packages, _context, elevate) {
    if (packages.length === 0) return [];
    return [
      {
        name: "dnf install",
        command: elevate(["dnf", "install", "-y", "--allowerasing", ...packages]),
      },
    ];
  },
  releases: [
    { test: "btm", name: "bottom", kind: "rpm-bottom", phase: "serial" },
    {
      test: "taplo",
      name: "taplo",
      kind: "binary",
      phase: "parallel",
      repo: "tamasfe/taplo",
      asset: (_release, arch) => `taplo-linux-${arch.release}.gz`,
      binary: "taplo",
    },
  ],
};
