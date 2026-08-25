# The only things that CANNOT be scripts: they have to change this shell's own
# state. Everything else belongs in ~/.local/bin.

# cd affects the calling shell, so a subprocess can never do this.
nd() { mkdir -p -- "$1" && cd -- "$1" }

# .zshrc runs `compinit -C`, which skips the dump-staleness check for speed.
# compinit must run in this shell, so this cannot be a script either.
rehash-completions() { rm -f ~/.zcompdump; autoload -Uz compinit && compinit -d ~/.zcompdump }

# bun completions (curl-installed bun keeps them here; guard = portable)
[ -s "$HOME/.bun/_bun" ] && source "$HOME/.bun/_bun"
