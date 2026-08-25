# Cross-OS shims so the macOS-flavored helpers (open, pbcopy/pbpaste) work on Linux too.
if [[ "$OSTYPE" != darwin* ]]; then
  if ! command -v open >/dev/null 2>&1; then
    open() { xdg-open "$@" >/dev/null 2>&1 & }
  fi
  if ! command -v pbcopy >/dev/null 2>&1; then
    pbcopy() {
      if command -v wl-copy >/dev/null 2>&1; then wl-copy
      else xclip -selection clipboard; fi
    }
    pbpaste() {
      if command -v wl-paste >/dev/null 2>&1; then wl-paste
      else xclip -selection clipboard -o; fi
    }
  fi
fi
