if [[ "$OSTYPE" == darwin* ]]; then
  alias c='security unlock-keychain "$HOME/Library/Keychains/login.keychain-db" && claude'
else
  alias c='claude'
fi
alias oc='opencode'
alias vi='hx'
