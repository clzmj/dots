#!/bin/sh
# Validates setup.sh without touching your real $HOME — every case runs against
# a throwaway home under a temp dir. Safe to run anywhere, including in a
# container as a non-root user:  sh test.sh
set -u
DOTS=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
B=$(mktemp -d); trap 'rm -rf "$B"' EXIT
FAILED=0
pass() { printf '  \033[32mPASS\033[0m %s\n' "$1"; }
fail() { printf '  \033[31mFAIL\033[0m %s — %s\n' "$1" "$2"; FAILED=1; }
run()  { env -i HOME="$1" PATH="$PATH" TERM=dumb DOTS_SKIP_PACKAGES=1 ${2:+$2} sh "$DOTS/setup.sh" 2>&1; }
dirty() { rm -rf "$1"; mkdir -p "$1/.config/helix"; echo MINE > "$1/.zshrc"
          printf '[user]\n\tname=Old\n' > "$1/.gitconfig"
          echo 'theme="mine"' > "$1/.config/helix/config.toml"; }

H=$B/t1; mkdir -p "$H"; run "$H" DOTS_YES=1 >/dev/null
[ "$(readlink "$H/.zshrc")" = "$DOTS/home/.zshrc" ] && pass "T1 zshrc symlinked" || fail T1 "not a symlink"
grep -q 'theme = "vesper"'   "$H/.config/helix/config.toml" && pass "T1 theme rendered"  || fail T1 theme
grep -q 'carlos@example.com' "$H/.config/git/local"          && pass "T1 git identity"   || fail T1 identity
[ "$(grep -c . "$H/.config/dots/answers")" = 2 ]             && pass "T1 answers cached" || fail T1 answers
[ -L "$H/.config/helix/languages.toml" ] && pass "T1 configs are links, not renders" || fail T1 "languages.toml is not a symlink"

O=$(run "$H" DOTS_YES=1)
case "$O" in *"already have"*) fail T2 "re-run saw conflicts" ;; *) [ -d "$H/.dots-backup" ] \
  && fail T2 "re-run created a backup" || pass "T2 idempotent" ;; esac
case "$O" in *"Broken pipe"*) fail T2 "broken pipe" ;; *) pass "T2 no broken pipe" ;; esac

H=$B/t3; dirty "$H"; O=$(run "$H" DOTS_YES=1)
case "$O" in *"already have"*) pass "T3 conflicts listed" ;; *) fail T3 "not listed" ;; esac
[ -L "$H/.zshrc" ] && [ "$(cat "$H"/.dots-backup/*/.zshrc)" = MINE ] && [ ! -e "$H/.gitconfig" ] \
  && pass "T3 replaced + backed up" || fail T3 "backup wrong"

H=$B/t4; dirty "$H"; run "$H" >/dev/null   # no tty, no DOTS_YES => declines
[ "$(cat "$H/.zshrc")" = MINE ] && [ -e "$H/.gitconfig" ] && [ ! -d "$H/.dots-backup" ] \
  && pass "T4 declined: kept mine" || fail T4 "clobbered my files"
[ -L "$H/.zprofile" ] && [ "$(ls "$H/.config/zsh" | wc -l | tr -d ' ')" -gt 0 ] \
  && pass "T4 non-conflicting still linked" || fail T4 "rest not linked"

H=$B/t5; mkdir -p "$H"
env -i HOME="$H" PATH="$PATH" DOTS_SKIP_PACKAGES=1 DOTS_YES=1 DOTS_NAME="Ada Lovelace" \
  DOTS_EMAIL="ada@example.org" sh "$DOTS/setup.sh" >/dev/null 2>&1
grep -q "Ada Lovelace" "$H/.config/git/local" && grep -q "ada@example.org" \
  "$H/.config/git/local" && pass "T5 env override" || fail T5 override

if command -v zsh >/dev/null 2>&1; then
  O=$(HOME=$B/t1 zsh -c 'source ~/.zshrc; echo LOADED; which gst' 2>&1)
  case "$O" in *LOADED*git\ status*) pass "T6 zsh loads, aliases live" ;; *) fail T6 "$O" ;; esac
  case "$O" in *"parse error"*|*"bad pattern"*|*"bad substitution"*) fail T6 "zsh syntax error" ;;
               *) pass "T6 no zsh syntax errors" ;; esac
else echo "  SKIP T6 (no zsh)"; fi

# nothing chezmoi-shaped may survive into a rendered file, and no @VAR@ may be left over
if grep -rlE '\{\{|@[A-Z_]+@' "$DOTS/home" 2>/dev/null | grep -q .; then
  fail T10 "a template placeholder crept back into the repo"
else pass "T10 repo has no template placeholders"; fi

# A file dropped from the repo must not leave a dangling symlink behind — a
# broken link still matches globs like ~/.config/zsh/*.zsh.
H=$B/t1; ln -sfn "$DOTS/home/.config/zsh/gone.zsh" "$H/.config/zsh/gone.zsh"
ln -sfn /etc/hostname "$H/.config/not-ours"          # must survive: not ours
run "$H" DOTS_YES=1 >/dev/null
if [ -L "$H/.config/zsh/gone.zsh" ]; then fail T11 "stale link not pruned"
elif [ ! -L "$H/.config/not-ours" ]; then fail T11 "pruned a link it did not create"
else pass "T11 prunes only its own stale links"; fi

sh -n "$DOTS/setup.sh" && pass "T7 sh -n" || fail T7 "sh -n"
if command -v dash >/dev/null 2>&1; then
  H=$B/t8; mkdir -p "$H"
  env -i HOME="$H" PATH="$PATH" DOTS_SKIP_PACKAGES=1 DOTS_YES=1 dash "$DOTS/setup.sh" >/dev/null 2>&1
  [ -L "$H/.zshrc" ] && pass "T8 runs under dash" || fail T8 dash
else echo "  SKIP T8 (no dash)"; fi

echo
[ $FAILED = 0 ] && echo "all green" || echo "FAILURES ABOVE"
exit $FAILED
