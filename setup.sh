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
if [ -z "$SELF_DIR" ] || [ ! -f "$SELF_DIR/packages.txt" ]; then
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
case "$(uname -m)" in
  x86_64|amd64)  DEB_ARCH=amd64; RPM_ARCH=x86_64;  UNAME_ARCH=x86_64 ;;
  aarch64|arm64) DEB_ARCH=arm64; RPM_ARCH=aarch64; UNAME_ARCH=aarch64 ;;
  *)             DEB_ARCH=$(uname -m); RPM_ARCH=$(uname -m); UNAME_ARCH=$(uname -m) ;;
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
ask FONT      "Terminal font"           "JetBrainsMonoNL Nerd Font Mono"
ask FONT_SIZE "Terminal font size"      "12"
ask THEME     "Theme (helix + herdr)"   "vesper"

# ── packages ────────────────────────────────────────────────────────────
# ── github release helpers (available to `gh` rows in packages.txt) ─────
# /releases/latest redirects to /releases/tag/<v>, so reading the redirect gets
# the version without the GitHub API's 60-request/hour unauthenticated limit.
gh_tag() {
  curl -fsSL -o /dev/null -w '%{url_effective}' "https://github.com/$1/releases/latest" 2>/dev/null |
    sed 's|.*/tag/||'
}

# expand %v (version), %d (deb arch), %r (rpm arch), %m (uname arch)
_gh_asset() {
  case "$UNAME_ARCH" in x86_64) _alt=x64 ;; aarch64) _alt=arm64 ;; *) _alt=$UNAME_ARCH ;; esac
  printf '%s' "$1" | sed "s|%v|$2|g; s|%d|$DEB_ARCH|g; s|%r|$RPM_ARCH|g; s|%m|$UNAME_ARCH|g; s|%A|$_alt|g"
}

_gh_fetch() {  # _gh_fetch REPO TEMPLATE  -> prints the downloaded path
  _tag=$(gh_tag "$1"); [ -n "$_tag" ] || return 1
  _asset=$(_gh_asset "$2" "${_tag#v}")
  _dir=$(mktemp -d)
  curl -fsSL --retry 2 -o "$_dir/$_asset" \
    "https://github.com/$1/releases/download/$_tag/$_asset" || return 1
  printf '%s' "$_dir/$_asset"
}

# gh_pkg REPO ASSET — install a .deb/.rpm through the system package manager so
# the distro keeps ownership of the files, rather than dropping a loose binary.
gh_pkg() {
  _f=$(_gh_fetch "$1" "$2") || return 1
  case "$_f" in
    *.deb) sudo dpkg -i "$_f" >/dev/null 2>&1 || sudo apt-get install -f -y >/dev/null 2>&1 ;;
    *.rpm) sudo rpm -Uvh --replacepkgs "$_f" >/dev/null 2>&1 ;;
    *) return 1 ;;
  esac
}

# gh_tar REPO ASSET BIN [STRIP] — extract one binary into ~/.local/bin
gh_tar() {
  _f=$(_gh_fetch "$1" "$2") || return 1
  _x=$(mktemp -d); tar -xzf "$_f" -C "$_x" 2>/dev/null || return 1
  _src=$(find "$_x" -type f -name "$3" -perm -u+x 2>/dev/null | head -1)
  [ -n "$_src" ] || return 1
  mkdir -p "$HOME/.local/bin" && install -m 755 "$_src" "$HOME/.local/bin/$3"
}

# gh_raw REPO ASSET BIN — a single-file asset (optionally .gz) -> ~/.local/bin
gh_raw() {
  _f=$(_gh_fetch "$1" "$2") || return 1
  mkdir -p "$HOME/.local/bin"
  case "$_f" in
    *.gz) gzip -dc "$_f" > "$HOME/.local/bin/$3" ;;
    *)    cat "$_f"      > "$HOME/.local/bin/$3" ;;
  esac
  chmod 755 "$HOME/.local/bin/$3"
}

# helix ships its grammars and themes in runtime/, and starts up SILENTLY
# broken without them, so the tarball needs more than the bare binary.
gh_helix() {
  _f=$(_gh_fetch helix-editor/helix "helix-%v-$UNAME_ARCH-linux.tar.xz") || return 1
  _x=$(mktemp -d); tar -xJf "$_f" -C "$_x" 2>/dev/null || return 1
  _root=$(dirname "$(find "$_x" -type f -name hx -perm -u+x | head -1)")
  [ -n "$_root" ] || return 1
  mkdir -p "$HOME/.local/bin" "$HOME/.config/helix"
  install -m 755 "$_root/hx" "$HOME/.local/bin/hx"
  rm -rf "$HOME/.config/helix/runtime"
  cp -R "$_root/runtime" "$HOME/.config/helix/runtime"
}

# Debian's golang is behind upstream; take the official tarball.
gh_golang() {
  _v=$(curl -fsSL https://go.dev/VERSION?m=text 2>/dev/null | head -1)
  [ -n "$_v" ] || return 1
  case "$UNAME_ARCH" in x86_64) _a=amd64 ;; aarch64) _a=arm64 ;; *) _a=$UNAME_ARCH ;; esac
  _t=$(mktemp -d)
  curl -fsSL -o "$_t/go.tgz" "https://go.dev/dl/${_v}.linux-${_a}.tar.gz" || return 1
  sudo rm -rf /usr/local/go && sudo tar -C /usr/local -xzf "$_t/go.tgz"
}

install_packages() {
  # PATH first: bun installs to ~/.bun/bin and the very next rows need it.
  PATH="$HOME/.local/bin:$HOME/.bun/bin:$HOME/go/bin:/usr/local/go/bin:$PATH"
  export PATH
  mkdir -p "$HOME/.local/bin"

  # Homebrew is macOS-only. Linux uses distro packages and vendor installers,
  # so there is no linuxbrew prefix anywhere in this script.
  if [ "$OS" = darwin ]; then
    if ! command -v brew >/dev/null 2>&1; then
      for p in /opt/homebrew/bin/brew /usr/local/bin/brew; do
        [ -x "$p" ] && eval "$("$p" shellenv)" && break
      done
    fi
    if ! command -v brew >/dev/null 2>&1; then
      say "installing homebrew"
      NONINTERACTIVE=1 /bin/bash -c \
        "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" \
        || warn "homebrew install failed"
      for p in /opt/homebrew/bin/brew /usr/local/bin/brew; do
        [ -x "$p" ] && eval "$("$p" shellenv)" && break
      done
    fi
    command -v brew >/dev/null 2>&1 && say "homebrew ready" || warn "homebrew unavailable"
  fi

  TAPS=""; BREWS=""; CASKS=""; SYS=""; BUNS=""; GOS=""
  SH_SPECS=$(mktemp); trap 'rm -f "$SH_SPECS"' EXIT

  # `read` splits on whitespace runs and drops the remainder into $rest, so the
  # column padding in packages.txt costs nothing.
  # kind  name  os  spec...   — `os` is darwin|linux|debian|fedora|arch or `-`
  while read -r mgr pkg os spec || [ -n "$mgr" ]; do
    case "$mgr" in ''|'#'*) continue ;; esac
    case "$os" in
      -|'') : ;;
      darwin|linux)          [ "$os" = "$OS" ]     || continue ;;
      debian|fedora|arch)    [ "$os" = "$DISTRO" ] || continue ;;
      *) warn "unknown os '$os' on: $mgr $pkg"; continue ;;
    esac
    if [ "$mgr" = "sh" ] || [ "$mgr" = "gh" ]; then
      printf '%s\t%s\n' "$pkg" "$spec" >> "$SH_SPECS"; continue
    fi
    case "$mgr" in
      go)   GOS="$GOS $pkg" ;;
      tap)  TAPS="$TAPS $pkg" ;;
      brew) BREWS="$BREWS $pkg" ;;
      cask) CASKS="$CASKS $pkg" ;;
      sys)  SYS="$SYS $pkg" ;;
      bun)  BUNS="$BUNS $pkg" ;;
      *) warn "unknown manager '$mgr' on: $mgr $pkg $rest" ;;
    esac
  done < "$DOTS/packages.txt"

  if [ "$OS" = linux ] && [ -n "$SYS" ]; then
    say "distro packages"
    if   command -v apt-get >/dev/null 2>&1; then
      sudo apt-get update -qq && sudo apt-get install -y $SYS || warn "apt failed"
    elif command -v dnf >/dev/null 2>&1; then
      sudo dnf install -y --allowerasing $SYS || warn "dnf failed"
    elif command -v pacman >/dev/null 2>&1; then
      sudo pacman -Sy --noconfirm $SYS || warn "pacman failed"
    else warn "no apt/dnf/pacman — install manually: $SYS"
    fi
  fi

  if [ "$OS" = darwin ] && command -v brew >/dev/null 2>&1; then
    [ -n "$TAPS" ]  && { say "taps"; for t in $TAPS; do brew tap "$t" >/dev/null || warn "tap $t failed"; done; }
    # One unresolvable name makes brew refuse the WHOLE batch, so a single typo
    # would install nothing at all. Batch for speed, then fall back per-formula
    # to isolate the bad ones.
    if [ -n "$BREWS" ]; then
      say "brew formulae"
      if ! brew install $BREWS; then
        warn "batch install failed — retrying one at a time"
        for f in $BREWS; do brew install "$f" || warn "  skipped: $f"; done
      fi
    fi
    [ -n "$CASKS" ] && [ "$OS" = darwin ] && { say "casks"; brew install --cask $CASKS || warn "some casks failed"; }
  elif [ -n "$BREWS" ]; then
    warn "no homebrew — skipped: $BREWS"
  fi

  if [ -s "$SH_SPECS" ]; then
    while IFS="$(printf '\t')" read -r bin cmd; do
      command -v "$bin" >/dev/null 2>&1 && continue
      say "installing $bin"
      # eval, not `sh -c`: gh rows call the gh_pkg/gh_tar helpers defined above
      eval "$cmd" || warn "$bin install failed"
    done < "$SH_SPECS"
  fi

  # go install builds a real standalone binary into ~/go/bin and needs only the
  # go toolchain — genuinely multi-OS, unlike bun/npm CLIs which still need node.
  if [ -n "$GOS" ]; then
    if command -v go >/dev/null 2>&1; then
      say "go install"
      for g in $GOS; do go install "$g@latest" || warn "  skipped: $g"; done
      # keep the command named `speedtest` as it is on macOS via the tap
      if [ -x "$HOME/go/bin/speedtest-go" ]; then
        mkdir -p "$HOME/.local/bin"
        ln -sfn "$HOME/go/bin/speedtest-go" "$HOME/.local/bin/speedtest"
      fi
    else warn "go missing — skipped: $GOS"
    fi
  fi

  if [ -n "$BUNS" ]; then
    if command -v bun >/dev/null 2>&1 || [ -x "$HOME/.bun/bin/bun" ]; then
      PATH="$HOME/.bun/bin:$PATH"
      say "bun globals"; bun add -g $BUNS || warn "some bun globals failed"
      # `bun add -g` symlinks straight to a cli.js whose shebang is
      # `#!/usr/bin/env node`, so these need node — except bun runs them fine
      # itself. Wrap them rather than install a second runtime; apt's node is
      # 20.x anyway, below what typescript-language-server 6 requires.
      if ! command -v node >/dev/null 2>&1; then
        for _l in "$HOME"/.bun/bin/*; do
          [ -L "$_l" ] || continue
          _t=$(readlink -f "$_l" 2>/dev/null) || continue
          # the shebang is the only reliable test — yaml-language-server's entry
          # point has no .js extension, so filtering on that misses it
          head -1 "$_t" 2>/dev/null | grep -q 'env node' || continue
          rm -f "$_l"
          printf '#!/bin/sh\nexec "%s/.bun/bin/bun" "%s" "$@"\n' "$HOME" "$_t" > "$_l"
          chmod +x "$_l"
        done
      fi
    else warn "bun missing — skipped: $BUNS"
    fi
  fi
}

if [ "${DOTS_SKIP_PACKAGES:-0}" = 1 ]; then
  warn "DOTS_SKIP_PACKAGES=1 — installing nothing"
else
  install_packages
fi

# ── plan ────────────────────────────────────────────────────────────────
# Work out every source→target pair up front, so conflicts can be shown as
# one list and confirmed once instead of file by file.
PLAN=$(mktemp); CONFLICTS=$(mktemp); RTMP=$(mktemp)
trap 'rm -f "$PLAN" "$CONFLICTS" "$RTMP" "${SH_SPECS:-}"' EXIT

emit()   { printf '%s\t%s\t%s\n' "$1" "$2" "$3" >> "$PLAN"; }   # mode src dst
# Answers are arbitrary user text, and in a sed replacement `\`, `&` and the
# `|` delimiter are all special: `|` aborts the expression, `&` expands to the
# whole match, `\` escapes. Escape each value once, then interpolate the copies.
sedesc() { printf '%s' "$1" | sed 's/[\\&|]/\\&/g'; }
R_HOME=$(sedesc "$HOME");     R_NAME=$(sedesc "$NAME");   R_EMAIL=$(sedesc "$EMAIL")
R_DESKTOP=$(sedesc "$DESKTOP")
R_FONT=$(sedesc "$FONT"); R_FONT_SIZE=$(sedesc "$FONT_SIZE"); R_THEME=$(sedesc "$THEME")

same_render() { render "$1" > "$RTMP"; cmp -s "$RTMP" "$2"; }
render() {
  sed -e "s|@HOME@|$R_HOME|g" -e "s|@NAME@|$R_NAME|g" -e "s|@EMAIL@|$R_EMAIL|g" \
      -e "s|@FONT@|$R_FONT|g" -e "s|@FONT_SIZE@|$R_FONT_SIZE|g" \
      -e "s|@THEME@|$R_THEME|g" -e "s|@DESKTOP@|$R_DESKTOP|g" "$1"
}
# home/ mirrors $HOME exactly (stow-style): home/.config/git/config -> ~/.config/git/config.
# Names and hierarchy are preserved verbatim; only a .in suffix is meaningful.
for f in $(find "$DOTS/home" -type f | sort); do
  rel=${f#"$DOTS"/home/}
  case "$rel" in *.in) emit render "$f" "$HOME/${rel%.in}" ;;
                 *)    emit link   "$f" "$HOME/$rel" ;; esac
done
emit write - "$HOME/.config/git/local"

while IFS="$(printf '\t')" read -r mode src dst; do
  [ -e "$dst" ] || [ -L "$dst" ] || continue
  if [ "$mode" = link ] && [ -L "$dst" ] && [ "$(readlink "$dst")" = "$src" ]; then continue; fi
  if [ "$mode" = render ] && same_render "$src" "$dst"; then continue; fi
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
say "linking config"
while IFS="$(printf '\t')" read -r mode src dst; do
  if [ "$mode" = link ] && [ -L "$dst" ] && [ "$(readlink "$dst")" = "$src" ]; then continue; fi
  if [ "$mode" = render ] && same_render "$src" "$dst"; then continue; fi
  if { [ -e "$dst" ] || [ -L "$dst" ]; } && conflicted "$dst"; then
    [ "$OVERWRITE" = 1 ] || continue
    stash "$dst"
  fi
  mkdir -p "$(dirname "$dst")"
  case "$mode" in
    link)   ln -sfn "$src" "$dst" ;;
    render) render "$src" > "$dst.dots-tmp" && mv -f "$dst.dots-tmp" "$dst" \
              || { rm -f "$dst.dots-tmp"; die "render failed: $src"; } ;;
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
