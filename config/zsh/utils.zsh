alias cat='bat'
alias ls='eza --git'
alias hfc='history -n 1 | fzf | tr -d "\n" | pbcopy'
alias randpw='openssl rand -base64 12 | pbcopy'
alias size='du -shc *'

notify() {
  local start_time=$(date +%s)

  local cmd_to_run=("$@")
  "${cmd_to_run[@]}"

  local cmd_status=$?
  local end_time=$(date +%s)
  local duration=$((end_time - start_time))

  local formatted_time=""
  local hours=$((duration / 3600))
  local minutes=$(((duration % 3600) / 60))
  local seconds=$((duration % 60))

  if [ $hours -gt 0 ]; then
    formatted_time="${hours}h ${minutes}m"
  elif [ $minutes -gt 0 ]; then
    formatted_time="${minutes}m ${seconds}s"
  else
    formatted_time="${seconds}s"
  fi

  local message=""
  if [ $cmd_status -eq 0 ]; then
    message="✅ Succeeded after ${formatted_time}"
  else
    message="❌ Failed (status: ${cmd_status}) after ${formatted_time}"
  fi

  echo -e '\033]777;notify;;'"$message"''
  return 0
}

# zshrc runs `compinit -C`, which skips the dump-staleness check for speed.
# Run this after installing tools that ship new completions.
rehash-completions() { rm -f ~/.zcompdump; autoload -Uz compinit && compinit -d ~/.zcompdump }

sysupdate() {
  git -C ~/dotfiles pull --ff-only && ~/dotfiles/setup.sh && brew upgrade && brew cleanup
}
