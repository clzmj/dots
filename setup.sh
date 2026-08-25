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

say "configuration"
ask NAME      "Full name (git commits)" "Carlos Lezama"
ask EMAIL     "Email (git commits)"     "carlos@example.com"
ask FONT      "Terminal font"           "JetBrainsMonoNL Nerd Font Mono"
ask FONT_SIZE "Terminal font size"      "12"
ask THEME     "Theme (helix + herdr)"   "vesper"

# ── packages ────────────────────────────────────────────────────────────
install_packages() {
  if ! command -v brew >/dev/null 2>&1; then
    for p in /opt/homebrew/bin/brew /home/linuxbrew/.linuxbrew/bin/brew; do
      [ -x "$p" ] && eval "$("$p" shellenv)" && break
    done
  fi
  if ! command -v brew >/dev/null 2>&1; then
    say "installing homebrew"
    NONINTERACTIVE=1 /bin/bash -c \
      "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" \
      || warn "homebrew install failed"
    for p in /opt/homebrew/bin/brew /home/linuxbrew/.linuxbrew/bin/brew; do
      [ -x "$p" ] && eval "$("$p" shellenv)" && break
    done
  fi

  TAPS=""; BREWS=""; CASKS=""; SYS=""; BUNS=""
  SH_SPECS=$(mktemp); trap 'rm -f "$SH_SPECS"' EXIT

  # `read` splits on whitespace runs and drops the remainder into $rest, so the
  # column padding in packages.txt costs nothing.
  while read -r mgr pkg rest || [ -n "$mgr" ]; do
    case "$mgr" in ''|'#'*) continue ;; esac
    if [ "$mgr" = "sh" ]; then
      printf '%s\t%s\n' "$pkg" "$rest" >> "$SH_SPECS"; continue
    fi
    case "$rest" in darwin|linux) [ "$rest" = "$OS" ] || continue ;; esac
    case "$mgr" in
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
      sudo dnf install -y $SYS || warn "dnf failed"
    elif command -v pacman >/dev/null 2>&1; then
      sudo pacman -Sy --noconfirm $SYS || warn "pacman failed"
    else warn "no apt/dnf/pacman — install manually: $SYS"
    fi
  fi

  if command -v brew >/dev/null 2>&1; then
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
  else
    warn "no homebrew — skipped: $BREWS"
  fi

  if [ -s "$SH_SPECS" ]; then
    while IFS="$(printf '\t')" read -r bin cmd; do
      command -v "$bin" >/dev/null 2>&1 && continue
      say "installing $bin"
      sh -c "$cmd" || warn "$bin install failed"
    done < "$SH_SPECS"
  fi

  if [ -n "$BUNS" ]; then
    if command -v bun >/dev/null 2>&1 || [ -x "$HOME/.bun/bin/bun" ]; then
      PATH="$HOME/.bun/bin:$PATH"
      say "bun globals"; bun add -g $BUNS || warn "some bun globals failed"
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
R_FONT=$(sedesc "$FONT"); R_FONT_SIZE=$(sedesc "$FONT_SIZE"); R_THEME=$(sedesc "$THEME")

same_render() { render "$1" > "$RTMP"; cmp -s "$RTMP" "$2"; }
render() {
  sed -e "s|@HOME@|$R_HOME|g" -e "s|@NAME@|$R_NAME|g" -e "s|@EMAIL@|$R_EMAIL|g" \
      -e "s|@FONT@|$R_FONT|g" -e "s|@FONT_SIZE@|$R_FONT_SIZE|g" \
      -e "s|@THEME@|$R_THEME|g" "$1"
}
for f in $(find "$DOTS/home" -type f | sort); do
  rel=${f#"$DOTS"/home/}
  case "$rel" in *.in) emit render "$f" "$HOME/.${rel%.in}" ;;
                 *)    emit link   "$f" "$HOME/.$rel" ;; esac
done
for f in $(find "$DOTS/config" -type f | sort); do
  rel=${f#"$DOTS"/config/}
  case "$rel" in *.in) emit render "$f" "$HOME/.config/${rel%.in}" ;;
                 *)    emit link   "$f" "$HOME/.config/$rel" ;; esac
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
