# Homebrew: same manifest on both OSes, different prefix.
if [ -x /opt/homebrew/bin/brew ]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
elif [ -x /home/linuxbrew/.linuxbrew/bin/brew ]; then
  eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"
fi

command -v hx &>/dev/null && export EDITOR=hx || export EDITOR=helix
export GIT_CONFIG_GLOBAL="$HOME/.config/git/config"
export VISUAL=$EDITOR
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

export HOMEBREW_NO_ENV_HINTS=1
export NODE_NO_WARNINGS=1
export _ZO_DOCTOR=0
[[ "$OSTYPE" == darwin* ]] && export OBJC_DISABLE_INITIALIZE_FORK_SAFETY=YES

path=(~/.local/bin ~/.cargo/bin ~/.bun/bin ~/go/bin $path)
export PATH
