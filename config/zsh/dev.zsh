alias activate='source .venv/bin/activate && which python'

# bun completions (curl-installed bun keeps them here; guard = portable)
[ -s "$HOME/.bun/_bun" ] && source "$HOME/.bun/_bun"
