#!/bin/sh
# Tiny bootstrap for:
#   curl -fsSL https://raw.githubusercontent.com/clzmj/dots/main/setup.sh | sh
# Everything after prerequisites, Bun, and the checkout lives in src/setup.ts.
set -eu

REPO_URL=${REPO_URL:-https://github.com/clzmj/dots}
DOTS=${DOTS:-"$HOME/dots"}
BUN_RELEASE=${DOTS_BUN_VERSION:-bun-v1.4.0}

say() { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m==>\033[0m %s\n' "$*" >&2; }
die() {
  printf '\033[1;31m==>\033[0m %s\n' "$*" >&2
  exit 1
}

case "$(uname -s)" in
  Darwin) BOOTSTRAP_PLATFORM=darwin ;;
  Linux)
    if command -v apt-get > /dev/null 2>&1; then
      BOOTSTRAP_PLATFORM=debian
    elif command -v dnf > /dev/null 2>&1; then
      BOOTSTRAP_PLATFORM=fedora
    elif command -v pacman > /dev/null 2>&1; then
      BOOTSTRAP_PLATFORM=arch
    else
      die "unsupported Linux distribution (need apt-get, dnf, or pacman)"
    fi
    ;;
  *) die "unsupported OS: $(uname -s) (Windows is not supported)" ;;
esac

as_root() {
  if [ "$(id -u)" = 0 ]; then
    "$@"
  elif command -v sudo > /dev/null 2>&1; then
    sudo "$@"
  else
    die "root privileges are required to install bootstrap prerequisites"
  fi
}

# Git gets the checkout, curl gets Bun, unzip is required by Bun's installer,
# and CA certificates make both downloads safe. Native package-manager calls
# are deliberately a single serialized bootstrap operation.
install_prerequisites() {
  _need=0
  for _command in git curl unzip bash; do
    command -v "$_command" > /dev/null 2>&1 || _need=1
  done
  case $BOOTSTRAP_PLATFORM in
    darwin)
      if ! xcode-select -p > /dev/null 2>&1; then
        xcode-select --install > /dev/null 2>&1 || true
        die "finish installing Apple's Command Line Tools, then run setup again"
      fi
      [ "$_need" = 0 ] && return 0
      for _command in git curl unzip bash; do
        command -v "$_command" > /dev/null 2>&1 || die "missing bootstrap prerequisite: $_command"
      done
      ;;
    debian)
      [ -r /etc/ssl/certs/ca-certificates.crt ] || _need=1
      [ "$_need" = 0 ] && return 0
      say "installing bootstrap prerequisites"
      as_root apt-get update -qq
      as_root apt-get install -y git curl unzip ca-certificates bash
      ;;
    fedora)
      [ -r /etc/pki/tls/certs/ca-bundle.crt ] \
        || [ -r /etc/ssl/certs/ca-certificates.crt ] || _need=1
      [ "$_need" = 0 ] && return 0
      say "installing bootstrap prerequisites"
      as_root dnf install -y --allowerasing git curl unzip ca-certificates bash
      ;;
    arch)
      [ -r /etc/ssl/certs/ca-certificates.crt ] || _need=1
      [ "$_need" = 0 ] && return 0
      say "installing bootstrap prerequisites"
      as_root pacman -S --needed --noconfirm git curl unzip ca-certificates bash
      ;;
  esac
}

bun_is_current() {
  _bun=$1
  [ -x "$_bun" ] || return 1
  _version=$("$_bun" --version 2> /dev/null | sed 's/[^0-9.].*$//')
  _major=${_version%%.*}
  _rest=${_version#*.}
  _minor=${_rest%%.*}
  case $_major in '' | *[!0-9]*) return 1 ;; esac
  case $_minor in '' | *[!0-9]*) return 1 ;; esac
  [ "$_major" -gt 1 ] || { [ "$_major" -eq 1 ] && [ "$_minor" -ge 4 ]; }
}

install_prerequisites

BUN_BIN=$(command -v bun 2> /dev/null || true)
[ -n "$BUN_BIN" ] || BUN_BIN="$HOME/.bun/bin/bun"
if ! bun_is_current "$BUN_BIN"; then
  say "installing Bun 1.4+"
  curl -fsSL --retry 2 https://bun.com/install | bash -s "$BUN_RELEASE"
  BUN_BIN="$HOME/.bun/bin/bun"
fi
bun_is_current "$BUN_BIN" || die "Bun 1.4 or newer is required (found: $("$BUN_BIN" --version 2> /dev/null || printf none))"
export PATH="$(dirname "$BUN_BIN"):$HOME/.local/bin:$PATH"

# A local checkout runs in place. A curl|sh invocation has no src/setup.ts
# beside $0, so clone (or fast-forward) the configured checkout first.
SELF_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" 2> /dev/null && pwd) || SELF_DIR=
if [ -n "$SELF_DIR" ] && [ -f "$SELF_DIR/src/setup.ts" ] && [ -d "$SELF_DIR/home" ]; then
  DOTS=$SELF_DIR
else
  if [ -d "$DOTS/.git" ]; then
    say "updating $DOTS"
    git -C "$DOTS" pull --ff-only
  elif [ -e "$DOTS" ]; then
    die "$DOTS exists but is not a git checkout"
  else
    say "cloning into $DOTS"
    git clone --depth 1 "$REPO_URL" "$DOTS"
  fi
fi

[ -f "$DOTS/src/setup.ts" ] || die "missing $DOTS/src/setup.ts"
exec "$BUN_BIN" --no-orphans "$DOTS/src/setup.ts" "$@"
