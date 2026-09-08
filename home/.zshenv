# Keep user-installed tools available in interactive shells, scripts, and
# one-shot SSH commands. These locations are shared by every supported OS.
typeset -U path PATH
path=(
  "$HOME/.local/bin"
  "$HOME/.bun/bin"
  "$HOME/.cargo/bin"
  "$HOME/.opencode/bin"
  "$HOME/go/bin"
  /usr/local/go/bin
  $path
)

# Homebrew is the macOS package prefix; /usr/local is its system-local Linux
# counterpart. System package-manager binaries remain in the inherited PATH.
if [[ "$OSTYPE" == darwin* ]]; then
  path=(/opt/homebrew/bin /opt/homebrew/sbin /usr/local/bin /usr/local/sbin $path)
else
  path=(/usr/local/bin /usr/local/sbin $path)
  [[ -d /snap/bin ]] && path+=(/snap/bin)
fi

export PATH
