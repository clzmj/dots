if [[ "$OSTYPE" == darwin* ]]; then
  alias c='security unlock-keychain "$HOME/Library/Keychains/login.keychain-db" && claude'
else
  alias c='claude'
fi
alias oc='opencode'
# Arch's helix package installs /usr/bin/helix (extra/hex already owns `hx`)
if command -v hx >/dev/null 2>&1; then alias vi='hx'
elif command -v helix >/dev/null 2>&1; then alias vi='helix'; alias hx='helix'
fi
