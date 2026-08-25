#!/bin/sh
# Every install command, per platform, in plain shell. Sourced by setup.sh — so
# this is just a script: `sh -n packages.sh` checks it, no format to learn.
#
# Nothing here re-installs what is already present, so a second run is quiet
# and needs no network.
#
#   pkg BIN [PACKAGE...]     this platform's package manager, unless BIN exists
#   have BIN                 a bare word is a binary; anything with "/" is a path
#   deb  REPO 'ASSET'        .deb from a GitHub release, installed via dpkg
#   rpm  REPO 'ASSET'        .rpm, via rpm
#   bin  REPO 'ASSET' NAME   single-file asset (optionally .gz) -> ~/.local/bin
#   tarbin REPO 'ASSET' NAME one binary out of a release tarball
#
# The thing to TEST is always the first argument, because package and binary
# names diverge constantly: ripgrep->rg, git-delta->delta, bottom->btm.
#
# SINGLE-QUOTE asset names and use ordinary shell variables inside them:
#   $V version (no leading v)   $DEB_ARCH amd64|arm64   $RPM_ARCH x86_64|aarch64
#   $ARCH x86_64|aarch64        $ARCH2 x64|arm64

# ── this platform's own packages ────────────────────────────────────────
# These come first: they provide the curl, unzip and xz the installers below
# need (bun's aborts outright without unzip).
case $PLATFORM in

darwin)
  # macOS ships git and curl, so test for Homebrew's specifically
  pkg "$HOMEBREW_PREFIX/bin/git"  git
  pkg "$HOMEBREW_PREFIX/bin/curl" curl
  pkg rg       ripgrep
  pkg fd
  pkg bat
  pkg eza
  pkg fzf
  pkg jq
  pkg delta    git-delta
  pkg gh
  pkg btm      bottom
  pkg hx       helix
  pkg taplo
  pkg go
  pkg aws      awscli
  pkg onefetch
  pkg tokei
  pkg usql     xo/xo/usql
  pkg terraform     hashicorp/tap/terraform
  pkg terraform-ls  hashicorp/tap/terraform-ls
  pkg "$HOMEBREW_PREFIX/share/zsh-autosuggestions/zsh-autosuggestions.zsh"         zsh-autosuggestions
  pkg "$HOMEBREW_PREFIX/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh" zsh-syntax-highlighting
  have "$HOME/Library/Fonts/JetBrainsMonoNerdFont-Regular.ttf" ||
    have /Library/Fonts/JetBrainsMonoNerdFont-Regular.ttf ||
    brew install --cask font-jetbrains-mono-nerd-font
  ;;

debian)
  pkg zsh
  pkg git
  pkg curl
  pkg rg     ripgrep
  pkg eza
  pkg fzf
  pkg jq
  pkg delta  git-delta
  pkg tokei
  pkg xclip
  pkg unzip
  pkg xz     xz-utils
  pkg cc     build-essential   # cargo needs a linker
  pkg /usr/share/ca-certificates ca-certificates
  pkg /usr/share/zsh-autosuggestions/zsh-autosuggestions.zsh         zsh-autosuggestions
  pkg /usr/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh zsh-syntax-highlighting
  # apt installs these as `fdfind` and `batcat`, which breaks `alias cat='bat'`
  have fd       || deb sharkdp/fd          'fd_${V}_${DEB_ARCH}.deb'
  have bat      || deb sharkdp/bat         'bat_${V}_${DEB_ARCH}.deb'
  have btm      || deb ClementTsang/bottom 'bottom_${V}-1_${DEB_ARCH}.deb'
  have gh       || tarbin cli/cli          'gh_${V}_linux_${DEB_ARCH}.tar.gz' gh
  have onefetch || tarbin o2sh/onefetch    'onefetch-linux.tar.gz' onefetch
  have taplo    || bin tamasfe/taplo       'taplo-linux-${ARCH}.gz' taplo
  have hx       || helix_release   # needs runtime/, not just the binary
  have go       || go_release      # Debian's golang lags upstream
  ;;

fedora)
  pkg cc     gcc               # cargo needs a linker
  pkg zsh
  pkg git
  pkg curl
  pkg rg     ripgrep
  pkg fd     fd-find
  pkg bat
  pkg eza
  pkg fzf
  pkg jq
  pkg delta  git-delta
  pkg tokei
  pkg onefetch
  pkg hx     helix
  pkg go     golang
  pkg gh
  pkg xclip
  pkg unzip
  pkg xz
  pkg /usr/share/zsh-autosuggestions/zsh-autosuggestions.zsh         zsh-autosuggestions
  pkg /usr/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh zsh-syntax-highlighting
  have btm   || rpm ClementTsang/bottom 'bottom-${V}-1.${RPM_ARCH}.rpm' \
             || tarbin ClementTsang/bottom 'bottom_${ARCH}-unknown-linux-gnu.tar.gz' btm
  have taplo || bin tamasfe/taplo 'taplo-linux-${ARCH}.gz' taplo
  ;;

arch)
  pkg cc     gcc               # cargo needs a linker
  # Arch packages everything, current, and renames nothing except github-cli.
  # helix installs /usr/bin/helix because extra/hex already owns `hx`;
  # aliases.zsh handles either name.
  pkg zsh
  pkg git
  pkg curl
  pkg rg     ripgrep
  pkg fd
  pkg bat
  pkg eza
  pkg fzf
  pkg jq
  pkg delta  git-delta
  pkg tokei
  pkg onefetch
  pkg helix
  pkg btm    bottom
  pkg go
  pkg gh     github-cli
  pkg taplo
  pkg xclip
  pkg unzip
  pkg xz
  pkg /usr/share/zsh/plugins/zsh-autosuggestions/zsh-autosuggestions.plugin.zsh         zsh-autosuggestions
  pkg /usr/share/zsh/plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.plugin.zsh zsh-syntax-highlighting
  ;;

esac

# ── Linux, any distro ───────────────────────────────────────────────────
# tailscale's installer detects the distro and wires up the right repo, so one
# line covers debian/fedora/arch. macOS uses the app, not this.
if [ "$OS" = linux ]; then
  have tailscale || curl -fsSL https://tailscale.com/install.sh | sh
fi

# ── every OS: one official installer each ───────────────────────────────
have bun      || curl -fsSL https://bun.com/install | bash
have claude   || curl -fsSL https://claude.ai/install.sh | bash
have codex    || curl -fsSL https://chatgpt.com/codex/install.sh | sh
have opencode || curl -fsSL https://opencode.ai/install | bash
have herdr    || curl -fsSL https://herdr.dev/install.sh | sh
have uv       || curl -LsSf https://astral.sh/uv/install.sh | sh
have cargo    || rustup_install

# ── every OS: cargo ─────────────────────────────────────────────────────
# Built from source into ~/.cargo/bin, which .zprofile has on PATH.
have zoxide   || cargo_install zoxide
have starship || cargo_install starship
have just     || cargo_install just
have wt       || cargo_install worktrunk

# ── every OS: language managers ─────────────────────────────────────────
have gopls     || go_install golang.org/x/tools/gopls
have speedtest || go_install github.com/showwin/speedtest-go

have pi                         || bun_install @earendil-works/pi-coding-agent
have bash-language-server       || bun_install bash-language-server
have typescript-language-server || bun_install typescript-language-server
have yaml-language-server       || bun_install yaml-language-server
have vscode-json-language-server || bun_install vscode-langservers-extracted
