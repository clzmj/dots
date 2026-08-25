#!/bin/sh
# One script, any Mac or Linux box:
#   curl -fsSL https://raw.githubusercontent.com/clzmj/dots/main/setup.sh | sh
#
# Idempotent. Asks before replacing anything you already have, and backs up
# whatever it replaces to ~/.dots-backup/<timestamp>/.
#
#   DOTS_YES=1              assume yes (never prompt; use defaults)
#   DOTS_SKIP_PACKAGES=1    link configs only, install nothing
#   DOTS_NAME=... DOTS_EMAIL=... DOTS_FONT=... DOTS_FONT_SIZE=... DOTS_THEME=...
set -eu

REPO_URL="${REPO_URL:-https://github.com/clzmj/dots}"
DOTS="${DOTS:-$HOME/dots}"
BACKUP="$HOME/.dots-backup/$(date +%Y%m%d-%H%M%S)"
ANSWERS="$HOME/.config/dots/answers"

say()  { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m==>\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m==>\033[0m %s\n' "$*" >&2; exit 1; }

# ── bootstrap ───────────────────────────────────────────────────────────
# Piped from curl? $0 is "sh" and there is no repo beside us — clone first.
SELF_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" 2>/dev/null && pwd) || SELF_DIR=""
if [ -z "$SELF_DIR" ] || [ ! -f "$SELF_DIR/packages.sh" ]; then
  command -v git >/dev/null 2>&1 || die "git is required to bootstrap"
  if [ -d "$DOTS/.git" ]; then
    say "updating $DOTS"; git -C "$DOTS" pull --ff-only
  else
    say "cloning into $DOTS"; git clone --depth 1 "$REPO_URL" "$DOTS"
  fi
  exec sh "$DOTS/setup.sh" "$@"
fi
DOTS=$SELF_DIR

case "$(uname -s)" in
  Darwin) OS=darwin ;;
  Linux)  OS=linux ;;
  *) die "unsupported OS: $(uname -s) (Windows is not supported)" ;;
esac

# Which Linux, and which arch names its packages use. Needed because release
# assets embed both (bottom ships bottom_0.14.8-1_arm64.deb, not a generic name).
DISTRO=other
if [ "$OS" = linux ]; then
  if   command -v apt-get >/dev/null 2>&1; then DISTRO=debian
  elif command -v dnf     >/dev/null 2>&1; then DISTRO=fedora
  elif command -v pacman  >/dev/null 2>&1; then DISTRO=arch
  fi
fi
# One value for packages.sh to switch on: darwin | debian | fedora | arch
if [ "$OS" = darwin ]; then PLATFORM=darwin; else PLATFORM=$DISTRO; fi

case "$(uname -m)" in
  x86_64|amd64)  DEB_ARCH=amd64; RPM_ARCH=x86_64;  ARCH=x86_64;  ARCH2=x64 ;;
  aarch64|arm64) DEB_ARCH=arm64; RPM_ARCH=aarch64; ARCH=aarch64; ARCH2=arm64 ;;
  *)             DEB_ARCH=$(uname -m); RPM_ARCH=$(uname -m); ARCH=$(uname -m); ARCH2=$(uname -m) ;;
esac

# Can we prompt? curl|sh has a pipe on stdin but usually still has a tty.
# [ -r /dev/tty ] lies (it can pass where opening fails), so actually open it:
# fd 3 reads the terminal, fd 4 writes to it, and stdin stays free for the pipe.
if [ "${DOTS_YES:-0}" = 1 ] || ! (exec 3</dev/tty) 2>/dev/null; then
  TTY=0
else
  TTY=1; exec 3</dev/tty 4>/dev/tty
fi
[ "$TTY" = 1 ] && say "$OS detected" || say "$OS detected (non-interactive)"

# ── questions ───────────────────────────────────────────────────────────
# ask VAR "Question" "default" — env DOTS_VAR wins, then a cached answer,
# then the prompt, then the default. Answers persist so re-runs stay quiet.
ask() {
  _v=$1; _q=$2; _d=$3
  eval "_env=\${DOTS_$_v:-}"
  if [ -n "$_env" ]; then _a=$_env
  else
    _a=""
    [ -f "$ANSWERS" ] && _a=$(sed -n "s|^$_v=||p" "$ANSWERS" | tail -1)
    if [ -z "$_a" ]; then
      if [ "$TTY" = 1 ]; then
        printf '  %s [%s]: ' "$_q" "$_d" >&4
        read -r _a <&3 || _a=""
      fi
      [ -z "$_a" ] && _a=$_d
    fi
  fi
  eval "$_v=\$_a"
  mkdir -p "$(dirname "$ANSWERS")"
  [ -f "$ANSWERS" ] && sed -i.bak "/^$_v=/d" "$ANSWERS" && rm -f "$ANSWERS.bak"
  printf '%s=%s\n' "$_v" "$_a" >> "$ANSWERS"
}

# confirm "Question" — per-run, never cached. Non-interactive answers no.
confirm() {
  [ "${DOTS_YES:-0}" = 1 ] && return 0
  [ "$TTY" = 1 ] || return 1
  printf '  %s [y/N]: ' "$1" >&4
  read -r _c <&3 || _c=""
  case "$_c" in y|Y|yes|YES) return 0 ;; *) return 1 ;; esac
}

# ghostty opens new windows here; macOS wants ~/Desktop, a Linux box wants $HOME
if [ "$OS" = darwin ]; then DESKTOP="$HOME/Desktop"; else DESKTOP="$HOME"; fi

say "configuration"
ask NAME      "Full name (git commits)" "Carlos Lezama"
ask EMAIL     "Email (git commits)"     "carlos@example.com"

# ── packages ────────────────────────────────────────────────────────────
# ── helpers available to packages.sh ────────────────────────────────────
have() { command -v "$1" >/dev/null 2>&1; }

# /releases/latest redirects to /releases/tag/<v>; reading the redirect avoids
# the GitHub API's 60-request/hour unauthenticated limit. (The API's asset list
# is not safely parseable without a real JSON parser, so build URLs instead.)
latest_tag() {
  curl -fsSL -o /dev/null -w '%{url_effective}' \
    "https://github.com/$1/releases/latest" 2>/dev/null | sed 's|.*/tag/||'
}

# _grab REPO 'ASSET' -> prints the downloaded path. ASSET is expanded here, so
# callers write ordinary shell vars ($V, $DEB_ARCH, ...) inside single quotes.
_grab() {
  _tag=$(latest_tag "$1"); [ -n "$_tag" ] || return 1
  V=${_tag#v}
  _asset=$(eval "printf '%s' \"$2\"")
  _dir=$(mktemp -d)
  curl -fsSL --retry 2 -o "$_dir/$_asset" \
    "https://github.com/$1/releases/download/$_tag/$_asset" || return 1
  printf '%s' "$_dir/$_asset"
}

# Install through the system package manager so the distro owns the files.
deb() { _f=$(_grab "$1" "$2") || return 1
        sudo dpkg -i "$_f" >/dev/null 2>&1 || sudo apt-get install -f -y >/dev/null 2>&1; }
rpm() { _f=$(_grab "$1" "$2") || return 1
        sudo command rpm -Uvh --replacepkgs "$_f" >/dev/null 2>&1; }

bin() {   # single-file asset, optionally gzipped
  _f=$(_grab "$1" "$2") || return 1
  mkdir -p "$HOME/.local/bin"
  { case "$_f" in *.gz) gzip -dc "$_f" ;; *) cat "$_f" ;; esac ; } > "$HOME/.local/bin/$3"
  chmod 755 "$HOME/.local/bin/$3"
}

tarbin() {   # one binary out of a release tarball
  _f=$(_grab "$1" "$2") || return 1
  _x=$(mktemp -d); tar -xf "$_f" -C "$_x" 2>/dev/null || return 1
  _src=$(find "$_x" -type f -name "$3" -perm -u+x 2>/dev/null | head -1)
  [ -n "$_src" ] || return 1
  mkdir -p "$HOME/.local/bin" && install -m 755 "$_src" "$HOME/.local/bin/$3"
}

# helix ships its grammars and themes in runtime/ and starts up SILENTLY broken
# without them, so it needs more than the bare binary.
helix_release() {
  _f=$(_grab helix-editor/helix 'helix-${V}-${ARCH}-linux.tar.xz') || return 1
  _x=$(mktemp -d); tar -xJf "$_f" -C "$_x" 2>/dev/null || return 1
  _root=$(dirname "$(find "$_x" -type f -name hx -perm -u+x | head -1)")
  [ -n "$_root" ] || return 1
  mkdir -p "$HOME/.local/bin" "$HOME/.config/helix"
  install -m 755 "$_root/hx" "$HOME/.local/bin/hx"
  rm -rf "$HOME/.config/helix/runtime"
  cp -R "$_root/runtime" "$HOME/.config/helix/runtime"
}

go_release() {   # Debian's golang lags upstream
  _v=$(curl -fsSL 'https://go.dev/VERSION?m=text' 2>/dev/null | head -1)
  [ -n "$_v" ] || return 1
  _t=$(mktemp -d)
  curl -fsSL -o "$_t/go.tgz" "https://go.dev/dl/${_v}.linux-${DEB_ARCH}.tar.gz" || return 1
  sudo rm -rf /usr/local/go && sudo tar -C /usr/local -xzf "$_t/go.tgz"
}

go_install() {
  have go || { warn "go missing — skipped: $*"; return 0; }
  for _g in "$@"; do go install "$_g@latest" || warn "  skipped: $_g"; done
  # keep the command named `speedtest`, as the Homebrew tap names it on macOS
  [ -x "$HOME/go/bin/speedtest-go" ] && ln -sfn "$HOME/go/bin/speedtest-go" "$HOME/.local/bin/speedtest"
  return 0
}

bun_install() {
  have bun || { warn "bun missing — skipped: $*"; return 0; }
  bun add -g "$@" || warn "some bun globals failed"
  # `bun add -g` symlinks to an entry point whose shebang is `#!/usr/bin/env
  # node`, so these need node — except bun runs them itself. Wrap rather than
  # install a second runtime; apt's node is older than tsserver 6 requires.
  have node && return 0
  for _l in "$HOME"/.bun/bin/*; do
    [ -L "$_l" ] || continue
    _t=$(readlink -f "$_l" 2>/dev/null) || continue
    head -1 "$_t" 2>/dev/null | grep -q 'env node' || continue
    rm -f "$_l"
    printf '#!/bin/sh\nexec "%s/.bun/bin/bun" "%s" "$@"\n' "$HOME" "$_t" > "$_l"
    chmod +x "$_l"
  done
  return 0
}

install_packages() {
  # PATH first: bun installs to ~/.bun/bin and the very next line needs it.
  PATH="$HOME/.local/bin:$HOME/.bun/bin:$HOME/go/bin:/usr/local/go/bin:$PATH"
  export PATH
  mkdir -p "$HOME/.local/bin"

  if [ "$OS" = darwin ]; then
    have brew || for p in /opt/homebrew/bin/brew /usr/local/bin/brew; do
      [ -x "$p" ] && eval "$("$p" shellenv)" && break
    done
    if ! have brew; then
      say "installing homebrew"
      NONINTERACTIVE=1 /bin/bash -c \
        "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" \
        || warn "homebrew install failed"
      for p in /opt/homebrew/bin/brew /usr/local/bin/brew; do
        [ -x "$p" ] && eval "$("$p" shellenv)" && break
      done
    fi
    have brew || { warn "homebrew unavailable — skipping packages"; return 0; }
  fi

  say "packages"
  # packages.sh is a config file that happens to be shell: one package failing
  # should warn, not abort the whole setup, so -e is off while it runs.
  set +e
  . "$DOTS/packages.sh"
  set -e
}

if [ "${DOTS_SKIP_PACKAGES:-0}" = 1 ]; then
  warn "DOTS_SKIP_PACKAGES=1 — installing nothing"
else
  install_packages
fi

# ── plan ────────────────────────────────────────────────────────────────
# Work out every source→target pair up front, so conflicts can be shown as
# one list and confirmed once instead of file by file.
PLAN=$(mktemp); CONFLICTS=$(mktemp)
trap 'rm -f "$PLAN" "$CONFLICTS"' EXIT

emit()   { printf '%s\t%s\t%s\n' "$1" "$2" "$3" >> "$PLAN"; }   # mode src dst

for f in $(find "$DOTS/home" -type f | sort); do
  rel=${f#"$DOTS"/home/}
  emit link "$f" "$HOME/$rel"
done
emit write - "$HOME/.config/git/local"

while IFS="$(printf '\t')" read -r mode src dst; do
  [ -e "$dst" ] || [ -L "$dst" ] || continue
  if [ "$mode" = link ] && [ -L "$dst" ] && [ "$(readlink "$dst")" = "$src" ]; then continue; fi
  [ "$mode" = write ] && continue          # never rewrite an existing git identity
  printf '%s\n' "${dst#"$HOME"/}" >> "$CONFLICTS"
done < "$PLAN"

# ~/.gitconfig is read AFTER ~/.config/git/config and silently wins.
[ -f "$HOME/.gitconfig" ] && [ ! -L "$HOME/.gitconfig" ] && echo ".gitconfig" >> "$CONFLICTS"

OVERWRITE=1
if [ -s "$CONFLICTS" ]; then
  printf '\n'
  warn "you already have these files:"
  sed 's|^|      ~/|' "$CONFLICTS" >&2
  printf '\n'
  if confirm "Replace them with the dots config? (originals move to ~/.dots-backup)"; then
    OVERWRITE=1
  else
    OVERWRITE=0
    warn "keeping your versions — everything else still gets linked"
  fi
fi

conflicted() { grep -qxF "${1#"$HOME"/}" "$CONFLICTS" 2>/dev/null; }

stash() {
  mkdir -p "$BACKUP/$(dirname "${1#"$HOME"/}")"
  mv "$1" "$BACKUP/${1#"$HOME"/}"
}

# ── apply ───────────────────────────────────────────────────────────────
# A file removed from the repo leaves the symlink we created pointing nowhere,
# and a dangling link still matches globs like ~/.config/zsh/*.zsh. Prune links
# that point into $DOTS but no longer resolve — only ever our own.
find "$HOME/.config" "$HOME" -maxdepth 5 -type l 2>/dev/null | while IFS= read -r _l; do
  case "$(readlink "$_l" 2>/dev/null)" in
    "$DOTS"/*) [ -e "$_l" ] || { rm -f "$_l"; warn "pruned stale link ${_l#"$HOME"/}"; } ;;
  esac
done

say "linking config"
while IFS="$(printf '\t')" read -r mode src dst; do
  if [ "$mode" = link ] && [ -L "$dst" ] && [ "$(readlink "$dst")" = "$src" ]; then continue; fi
  if { [ -e "$dst" ] || [ -L "$dst" ]; } && conflicted "$dst"; then
    [ "$OVERWRITE" = 1 ] || continue
    stash "$dst"
  fi
  mkdir -p "$(dirname "$dst")"
  case "$mode" in
    link)   ln -sfn "$src" "$dst" ;;
    write)  [ -e "$dst" ] || printf '[user]\n\tname = %s\n\temail = %s\n' "$NAME" "$EMAIL" > "$dst" ;;
  esac
done < "$PLAN"

if [ "$OVERWRITE" = 1 ] && [ -f "$HOME/.gitconfig" ] && [ ! -L "$HOME/.gitconfig" ]; then
  stash "$HOME/.gitconfig"
  warn "moved ~/.gitconfig aside (it would shadow ~/.config/git/config)"
fi

# ── login shell ─────────────────────────────────────────────────────────
ZSH_BIN=$(command -v zsh || true)
if [ -n "$ZSH_BIN" ] && [ "${SHELL:-}" != "$ZSH_BIN" ]; then
  if [ "${DOTS_SKIP_PACKAGES:-0}" != 1 ]; then
    grep -qxF "$ZSH_BIN" /etc/shells 2>/dev/null || \
      echo "$ZSH_BIN" | sudo tee -a /etc/shells >/dev/null 2>&1 || true
    chsh -s "$ZSH_BIN" 2>/dev/null || warn "could not chsh — run: chsh -s $ZSH_BIN"
  fi
fi

[ -d "$BACKUP" ] && say "replaced files are in $BACKUP"
say "done — open a new shell"
