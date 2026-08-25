# Homebrew is macOS-only; Linux uses distro packages and vendor installers.
for _b in /opt/homebrew/bin/brew /usr/local/bin/brew; do
  [ -x "$_b" ] && { eval "$("$_b" shellenv)"; break }
done
unset _b

command -v hx &>/dev/null && export EDITOR=hx || export EDITOR=helix
export GIT_CONFIG_GLOBAL="$HOME/.config/git/config"
export VISUAL=$EDITOR
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

export HOMEBREW_NO_ENV_HINTS=1
export NODE_NO_WARNINGS=1
export _ZO_DOCTOR=0
[[ "$OSTYPE" == darwin* ]] && export OBJC_DISABLE_INITIALIZE_FORK_SAFETY=YES

# Everything that can receive a binary. Keep in sync with install_packages().
path=(~/.local/bin ~/.bun/bin ~/go/bin ~/.cargo/bin /usr/local/go/bin $path)
export PATH
