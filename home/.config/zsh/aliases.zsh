# Every alias lives here. Anything that can run in a subprocess is a script in
# ~/.local/bin instead; anything that must act on THIS shell is in shell.zsh.

# ── core ────────────────────────────────────────────────────────────────
alias cat='bat'
alias ls='eza --git'
alias l='ls -lah'
alias la='ls -lAh'
alias -- -='cd -'
alias -g ...='../..'

# ── git ─────────────────────────────────────────────────────────────────
alias ga='git add'
alias gb='git branch'
alias gc='git commit --verbose'
alias gcb='git checkout -b'
alias gco='git checkout'
alias gd='git diff'
alias gl='git pull'
alias gp='git push'
alias gst='git status'
alias repo-info='onefetch --no-art --no-color-palette; tokei'

# ── editors and agents ──────────────────────────────────────────────────
alias oc='opencode'
if [[ "$OSTYPE" == darwin* ]]; then
  alias c='security unlock-keychain "$HOME/Library/Keychains/login.keychain-db" && claude'
else
  alias c='claude'
fi
# Arch's helix package installs /usr/bin/helix (extra/hex already owns `hx`)
if command -v hx >/dev/null 2>&1; then alias vi='hx'
elif command -v helix >/dev/null 2>&1; then alias vi='helix'; alias hx='helix'
fi

# ── python ──────────────────────────────────────────────────────────────
alias activate='source .venv/bin/activate && which python'
