nd() {
  mkdir -p -- "$1" && cd -- "$1"
}

alias l='ls -lah'
alias la='ls -lAh'
alias -- -='cd -'
alias -g ...='../..'
alias -g ....='../../..'
