#!/bin/sh
# Every install command, per OS, in plain shell. Sourced by setup.sh — so this
# is just a script: `sh -n packages.sh` checks it and there is no format to learn.
#
# Helpers, all no-ops when the tool is already present:
#   have BIN                 is it installed?
#   deb  REPO 'ASSET'        .deb from a GitHub release, installed via dpkg
#   rpm  REPO 'ASSET'        .rpm, via rpm
#   bin  REPO 'ASSET' NAME   single-file asset (optionally .gz) -> ~/.local/bin
#   tarbin REPO 'ASSET' NAME one binary out of a release tarball
#
# SINGLE-QUOTE the asset name and use ordinary shell variables in it:
#   $V         version, no leading v      $ARCH   uname -m  (x86_64 | aarch64)
#   $DEB_ARCH  amd64 | arm64              $ARCH2  x64 | arm64
#   $RPM_ARCH  x86_64 | aarch64

# ── this platform's own packages ────────────────────────────────────────
# These come first: they provide the curl, unzip and xz that the installers
# below depend on (bun's aborts outright without unzip).
case $PLATFORM in

darwin)
  brew tap xo/xo
  brew tap hashicorp/tap
  brew install git curl ripgrep fd bat eza fzf jq git-delta gh bottom helix \
               taplo go awscli onefetch tokei \
               zsh-autosuggestions zsh-syntax-highlighting \
               xo/xo/usql hashicorp/tap/terraform hashicorp/tap/terraform-ls
  brew install --cask font-jetbrains-mono-nerd-font
  ;;

debian)
  sudo apt-get update -qq
  sudo apt-get install -y zsh git curl ripgrep eza fzf jq git-delta tokei \
                          zsh-autosuggestions zsh-syntax-highlighting \
                          xclip unzip xz-utils ca-certificates
  # apt installs these as `fdfind` and `batcat`, which breaks `alias cat='bat'`
  have fd       || deb sharkdp/fd          'fd_${V}_${DEB_ARCH}.deb'
  have bat      || deb sharkdp/bat         'bat_${V}_${DEB_ARCH}.deb'
  # not in Debian at all; binary is btm
  have btm      || deb ClementTsang/bottom 'bottom_${V}-1_${DEB_ARCH}.deb'
  # Debian's gh is far behind upstream
  have gh       || tarbin cli/cli          'gh_${V}_linux_${DEB_ARCH}.tar.gz' gh
  have onefetch || tarbin o2sh/onefetch    'onefetch-linux.tar.gz' onefetch
  have taplo    || bin tamasfe/taplo       'taplo-linux-${ARCH}.gz' taplo
  have hx       || helix_release   # needs runtime/, not just the binary
  have go       || go_release      # Debian's golang lags upstream
  ;;

fedora)
  # minimal images ship curl-minimal, which plain `dnf install curl` conflicts with
  sudo dnf install -y --allowerasing zsh git curl ripgrep fd-find bat eza fzf jq \
                      git-delta tokei onefetch helix golang gh \
                      zsh-autosuggestions zsh-syntax-highlighting xclip unzip xz
  have btm   || rpm ClementTsang/bottom 'bottom-${V}-1.${RPM_ARCH}.rpm' \
             || tarbin ClementTsang/bottom 'bottom_${ARCH}-unknown-linux-gnu.tar.gz' btm
  have taplo || bin tamasfe/taplo 'taplo-linux-${ARCH}.gz' taplo
  ;;

arch)
  # Arch packages everything, current, and renames nothing except github-cli.
  # helix installs /usr/bin/helix because extra/hex already owns `hx`;
  # aliases.zsh handles either name.
  sudo pacman -S --needed --noconfirm zsh git curl ripgrep fd bat eza fzf jq \
       git-delta tokei onefetch helix bottom go github-cli taplo \
       zsh-autosuggestions zsh-syntax-highlighting xclip unzip xz
  ;;

esac

# ── every OS: one official installer each ───────────────────────────────
have bun      || curl -fsSL https://bun.com/install | bash
have claude   || curl -fsSL https://claude.ai/install.sh | bash
have herdr    || curl -fsSL https://herdr.dev/install.sh | sh
have uv       || curl -LsSf https://astral.sh/uv/install.sh | sh
have zoxide   || curl -sSfL https://raw.githubusercontent.com/ajeetdsouza/zoxide/main/install.sh | sh
have starship || curl -sS https://starship.rs/install.sh | sh -s -- -y -b "$HOME/.local/bin"
have just     || curl --proto '=https' --tlsv1.2 -sSf https://just.systems/install.sh | bash -s -- --force --to "$HOME/.local/bin"
# this installer appends /bin to the dir it is given
have wt       || curl --proto '=https' --tlsv1.2 -LsSf https://github.com/max-sixty/worktrunk/releases/latest/download/worktrunk-installer.sh | WORKTRUNK_INSTALL_DIR="$HOME/.local" sh

# ── every OS: language managers ─────────────────────────────────────────
go_install golang.org/x/tools/gopls
go_install github.com/showwin/speedtest-go

bun_install opencode-ai @openai/codex @earendil-works/pi-coding-agent \
            bash-language-server typescript-language-server \
            yaml-language-server vscode-langservers-extracted
