nd() {
  mkdir -p -- "$1" && cd -- "$1"
}

tree() {
  local ignore_patterns=(
    "__pycache__"
    ".DS_Store"
    ".git"
    ".next"
    ".ruff_cache"
    ".svelte-kit"
    ".terraform"
    ".venv"
    "node_modules"
    "target"
    "venv"
  )

  local IFS='|'
  eza --tree --all --git --ignore-glob "${ignore_patterns[*]}" "$@"
}

alias l='ls -lah'
alias la='ls -lAh'
alias -- -='cd -'
alias -g ...='../..'
alias -g ....='../../..'
