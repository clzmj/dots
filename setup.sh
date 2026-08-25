#!/bin/sh
# One script, any Mac or Linux box:
#   curl -fsSL https://raw.githubusercontent.com/carrots-sh/dotfiles/main/setup.sh | sh
# Idempotent. Anything it displaces is moved to ~/.dotfiles-backup/<timestamp>/.
set -eu

REPO_URL="${REPO_URL:-https://github.com/carrots-sh/dotfiles}"
DOTFILES="${DOTFILES:-$HOME/dotfiles}"
BACKUP="$HOME/.dotfiles-backup/$(date +%Y%m%d-%H%M%S)"

say()  { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m==>\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m==>\033[0m %s\n' "$*" >&2; exit 1; }

# ── bootstrap ───────────────────────────────────────────────────────────
# Piped from curl? $0 is "sh" and there is no repo next to us — clone first.
SELF_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" 2>/dev/null && pwd) || SELF_DIR=""
if [ -z "$SELF_DIR" ] || [ ! -f "$SELF_DIR/packages.txt" ]; then
  command -v git >/dev/null 2>&1 || die "git is required to bootstrap"
  if [ -d "$DOTFILES/.git" ]; then
    say "updating $DOTFILES"; git -C "$DOTFILES" pull --ff-only
  else
    say "cloning into $DOTFILES"; git clone --depth 1 "$REPO_URL" "$DOTFILES"
  fi
  exec sh "$DOTFILES/setup.sh" "$@"
fi
DOTFILES=$SELF_DIR

case "$(uname -s)" in
  Darwin) OS=darwin ;;
  Linux)  OS=linux ;;
  *) die "unsupported OS: $(uname -s) (Windows is not supported)" ;;
esac
say "setting up for $OS from $DOTFILES"

# ── homebrew ────────────────────────────────────────────────────────────
if ! command -v brew >/dev/null 2>&1; then
  for p in /opt/homebrew/bin/brew /home/linuxbrew/.linuxbrew/bin/brew; do
    [ -x "$p" ] && eval "$("$p" shellenv)" && break
  done
fi
if ! command -v brew >/dev/null 2>&1; then
  say "installing homebrew"
  NONINTERACTIVE=1 /bin/bash -c \
    "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  for p in /opt/homebrew/bin/brew /home/linuxbrew/.linuxbrew/bin/brew; do
    [ -x "$p" ] && eval "$("$p" shellenv)" && break
  done
fi
command -v brew >/dev/null 2>&1 || die "homebrew install failed"

# ── packages ────────────────────────────────────────────────────────────
# Collect per-manager lists first, then install in one batch each.
TAPS=""; BREWS=""; CASKS=""; SYS=""; BUNS=""
SH_SPECS=$(mktemp)
trap 'rm -f "$SH_SPECS"' EXIT

# `read` splits on whitespace runs and drops the remainder into $rest, so the
# column padding in packages.txt costs nothing.
while read -r mgr pkg rest || [ -n "$mgr" ]; do
  case "$mgr" in ''|'#'*) continue ;; esac
  if [ "$mgr" = "sh" ]; then
    printf '%s\t%s\n' "$pkg" "$rest" >> "$SH_SPECS"
    continue
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
done < "$DOTFILES/packages.txt"

[ -n "$TAPS" ]  && { say "taps";  for t in $TAPS; do brew tap "$t" >/dev/null; done; }
[ -n "$BREWS" ] && { say "brew formulae"; brew install $BREWS || warn "some formulae failed"; }
[ -n "$CASKS" ] && [ "$OS" = darwin ] && { say "casks"; brew install --cask $CASKS || warn "some casks failed"; }

if [ "$OS" = linux ] && [ -n "$SYS" ]; then
  say "distro packages"
  if   command -v apt-get >/dev/null 2>&1; then sudo apt-get update -qq && sudo apt-get install -y $SYS
  elif command -v dnf     >/dev/null 2>&1; then sudo dnf install -y $SYS
  elif command -v pacman  >/dev/null 2>&1; then sudo pacman -S --noconfirm $SYS
  else warn "no apt/dnf/pacman — install manually: $SYS"
  fi
fi

if [ -s "$SH_SPECS" ]; then
  while IFS="$(printf '\t')" read -r bin cmd; do
    if command -v "$bin" >/dev/null 2>&1; then continue; fi
    say "installing $bin"
    sh -c "$cmd" || warn "$bin install failed"
  done < "$SH_SPECS"
fi

if [ -n "$BUNS" ]; then
  if command -v bun >/dev/null 2>&1 || [ -x "$HOME/.bun/bin/bun" ]; then
    PATH="$HOME/.bun/bin:$PATH"
    say "bun globals"; bun add -g $BUNS || warn "some bun globals failed"
  else warn "bun missing — skipping: $BUNS"
  fi
fi

# ── symlinks ────────────────────────────────────────────────────────────
link() {
  src=$1; dst=$2
  if [ -L "$dst" ] && [ "$(readlink "$dst")" = "$src" ]; then return 0; fi
  if [ -e "$dst" ] || [ -L "$dst" ]; then
    mkdir -p "$BACKUP/$(dirname "${dst#"$HOME"/}")"
    mv "$dst" "$BACKUP/${dst#"$HOME"/}"
    warn "backed up ${dst#"$HOME"/}"
  fi
  mkdir -p "$(dirname "$dst")"
  ln -s "$src" "$dst"
}

say "linking dotfiles"
find "$DOTFILES/home" -type f | while IFS= read -r f; do
  link "$f" "$HOME/.${f#"$DOTFILES"/home/}"
done
find "$DOTFILES/config" -type f ! -name '*.in' | while IFS= read -r f; do
  link "$f" "$HOME/.config/${f#"$DOTFILES"/config/}"
done

# helix can't expand ~ in config paths — this one file is generated, not linked
mkdir -p "$HOME/.config/helix"
sed "s|@HOME@|$HOME|g" "$DOTFILES/config/helix/languages.toml.in" \
  > "$HOME/.config/helix/languages.toml"

# ~/.gitconfig is read AFTER ~/.config/git/config and silently wins — retire it.
if [ -f "$HOME/.gitconfig" ] && [ ! -L "$HOME/.gitconfig" ]; then
  mkdir -p "$BACKUP"
  mv "$HOME/.gitconfig" "$BACKUP/.gitconfig"
  warn "moved ~/.gitconfig aside (it would shadow ~/.config/git/config)"
fi

# ── git identity (the only thing we ask) ────────────────────────────────
if [ ! -f "$HOME/.config/git/local" ]; then
  if [ -e /dev/tty ]; then
    printf 'Full name (git commits): ' > /dev/tty; read -r GIT_NAME  < /dev/tty
    printf 'Email (git commits):    ' > /dev/tty; read -r GIT_EMAIL < /dev/tty
    cat > "$HOME/.config/git/local" <<EOF
[user]
	name = $GIT_NAME
	email = $GIT_EMAIL
EOF
    say "wrote ~/.config/git/local"
  else
    warn "no tty — write ~/.config/git/local yourself ([user] name/email)"
  fi
fi

# ── login shell ─────────────────────────────────────────────────────────
ZSH_BIN=$(command -v zsh || true)
if [ -n "$ZSH_BIN" ] && [ "${SHELL:-}" != "$ZSH_BIN" ]; then
  grep -qxF "$ZSH_BIN" /etc/shells 2>/dev/null || \
    echo "$ZSH_BIN" | sudo tee -a /etc/shells >/dev/null
  chsh -s "$ZSH_BIN" || warn "chsh failed — run: chsh -s $ZSH_BIN"
fi

[ -d "$BACKUP" ] && say "displaced files are in $BACKUP"
say "done — open a new shell"
