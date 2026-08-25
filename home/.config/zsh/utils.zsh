alias cat='bat'
alias ls='eza --git'
alias hfc='history -n 1 | fzf | tr -d "\n" | pbcopy'
alias randpw='openssl rand -base64 12 | pbcopy'
alias size='du -shc *'

# zshrc runs `compinit -C`, which skips the dump-staleness check for speed.
# Run this after installing tools that ship new completions.
rehash-completions() { rm -f ~/.zcompdump; autoload -Uz compinit && compinit -d ~/.zcompdump }
