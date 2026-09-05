import type { PlatformInstaller } from "./types";

export const debian: PlatformInstaller = {
  platform: "debian",
  native: [
    { test: "zsh", packages: ["zsh"] },
    { test: "git", packages: ["git"] },
    { test: "curl", packages: ["curl"] },
    { test: "rg", packages: ["ripgrep"] },
    { test: "eza", packages: ["eza"] },
    { test: "fzf", packages: ["fzf"] },
    { test: "lsof", packages: ["lsof"] },
    { test: "wl-copy", packages: ["wl-clipboard"] },
    { test: "jq", packages: ["jq"] },
    { test: "delta", packages: ["git-delta"] },
    { test: "tokei", packages: ["tokei"] },
    { test: "xclip", packages: ["xclip"] },
    { test: "unzip", packages: ["unzip"] },
    { test: "xz", packages: ["xz-utils"] },
    { test: "cc", packages: ["build-essential"] },
    { test: "/usr/share/ca-certificates", packages: ["ca-certificates"] },
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
      { name: "apt update", command: elevate(["apt-get", "update", "-qq"]) },
      { name: "apt install", command: elevate(["apt-get", "install", "-y", ...packages]) },
    ];
  },
  releases: [
    {
      test: "fd",
      name: "fd",
      kind: "deb",
      phase: "serial",
      repo: "sharkdp/fd",
      asset: ({ version }, arch) => `fd_${version}_${arch.deb}.deb`,
    },
    {
      test: "bat",
      name: "bat",
      kind: "deb",
      phase: "serial",
      repo: "sharkdp/bat",
      asset: ({ version }, arch) => `bat_${version}_${arch.deb}.deb`,
    },
    {
      test: "btm",
      name: "bottom",
      kind: "deb",
      phase: "serial",
      repo: "ClementTsang/bottom",
      asset: ({ version }, arch) => `bottom_${version}-1_${arch.deb}.deb`,
    },
    {
      test: "gh",
      name: "gh",
      kind: "tar",
      phase: "parallel",
      repo: "cli/cli",
      asset: ({ version }, arch) => `gh_${version}_linux_${arch.deb}.tar.gz`,
      binary: "gh",
    },
    {
      test: "onefetch",
      name: "onefetch",
      kind: "tar",
      phase: "parallel",
      repo: "o2sh/onefetch",
      asset: () => "onefetch-linux.tar.gz",
      binary: "onefetch",
    },
    {
      test: "taplo",
      name: "taplo",
      kind: "binary",
      phase: "parallel",
      repo: "tamasfe/taplo",
      asset: (_release, arch) => `taplo-linux-${arch.release}.gz`,
      binary: "taplo",
    },
    { test: "hx", name: "helix", kind: "helix", phase: "parallel" },
    { test: "go", name: "go", kind: "go", phase: "parallel" },
  ],
};
