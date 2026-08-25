# Linux boxes lack Ghostty's terminfo — fall back to a universal TERM
if [[ "$OSTYPE" != darwin* && "$TERM" == "xterm-ghostty" ]]; then
  export TERM=xterm-256color
fi

# Completions. -C skips the (slow) dump-staleness check; `rehash-completions`
# in utils.zsh regenerates it after installing new tools.
autoload -Uz compinit
compinit -C -d ~/.zcompdump

# guarded so a missing tool doesn't shout on every shell start
command -v starship >/dev/null 2>&1 && eval "$(starship init zsh)"
command -v zoxide   >/dev/null 2>&1 && eval "$(zoxide init zsh --cmd cd)"
fzf --zsh >/dev/null 2>&1 && source <(fzf --zsh)   # --zsh needs fzf >= 0.48
command -v wt  >/dev/null 2>&1 && eval "$(command wt config shell init zsh)"

# Each distro puts these somewhere different, and Arch also renames the file to
# *.plugin.zsh — looking only in the brew prefix left them dead on every Linux box.
_zsh_plugin() {
  local name=$1 p
  for p in \
    "${HOMEBREW_PREFIX:-/opt/homebrew}/share/$name/$name.zsh" \
    "/usr/share/$name/$name.zsh" \
    "/usr/share/zsh/plugins/$name/$name.plugin.zsh" \
    "/usr/local/share/$name/$name.zsh"
  do
    [[ -f $p ]] && { source "$p"; return 0 }
  done
  return 1
}
_zsh_plugin zsh-autosuggestions
_zsh_plugin zsh-syntax-highlighting   # must be sourced last
unfunction _zsh_plugin

for file in ~/.config/zsh/*.zsh(N); do source "$file"; done

# History
HISTFILE=~/.zsh_history
HISTSIZE=50000
SAVEHIST=50000
setopt HIST_IGNORE_ALL_DUPS HIST_REDUCE_BLANKS SHARE_HISTORY EXTENDED_HISTORY

# Ctrl-C leaves the cursor visible
TRAPINT() { printf '\033[?25h'; return $(( 128 + $1 )); }

# bun completions
[ -s "/Users/carlos/.bun/_bun" ] && source "/Users/carlos/.bun/_bun"
