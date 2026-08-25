alias ga='git add'
alias gb='git branch'
alias gc='git commit --verbose'
alias gcb='git checkout -b'
alias gco='git checkout'
alias gd='git diff'
alias gl='git pull'
alias gp='git push'
alias gst='git status'

alias gchanges='git ls-files --modified --exclude-standard'
alias gignored='git ls-files --cached --ignored --exclude-standard -z | xargs -0 git rm --cached'
alias guntracked='git ls-files . --exclude-standard --others'
alias repo-info='onefetch --no-art --no-color-palette || true && tokei || true && scc || true'

www() {
  local remote url branch repo_root rel_path host

  remote=$(git remote get-url origin 2>/dev/null || git remote -v | awk '/\(fetch\)/{print $2; exit}')
  url=$(echo "$remote" | sed -E 's|^git@([^:]+):(.*)\.git$|https://\1/\2|' | sed 's|\.git$||')

  branch=$(git branch --show-current)
  repo_root=$(git rev-parse --show-toplevel)
  rel_path=$(realpath --relative-to="$repo_root" "${1:-$PWD}" 2>/dev/null || echo "")

  host=$(echo "$url" | awk -F/ '{print $3}')

  if [[ -n "$branch" ]]; then
    if [[ "$host" == *gitlab* ]]; then
      url="$url/-/tree/$branch/$rel_path"
    else
      url="$url/tree/$branch/$rel_path"
    fi
  fi

  open "$url"
}

blame-menu() {
  local file="$1"
  local line="$2"

  local root rel sha blame remote base host branch
  root=$(git rev-parse --show-toplevel) || return
  rel=$(realpath --relative-to="$root" "$file")

  blame=$(git blame -L "$line,$line" -- "$rel")
  sha=$(awk '{print $1}' <<<"$blame")

  remote=$(git remote get-url origin 2>/dev/null || git remote -v | awk '/\(fetch\)/{print $2; exit}')
  base=$(echo "$remote" | sed -E 's|^git@([^:]+):(.*)\.git$|https://\1/\2|' | sed 's|\.git$||')
  host=$(awk -F/ '{print $3}' <<<"$base")

  branch=$(git branch --show-current)

  if [[ "$host" == *gitlab* ]]; then
    url_commit="$base/-/commit/$sha"
    url_line_commit="$base/-/blob/$sha/$rel#L$line"
    url_line_branch="$base/-/blob/$branch/$rel#L$line"
  else
    url_commit="$base/commit/$sha"
    url_line_commit="$base/blob/$sha/$rel#L$line"
    url_line_branch="$base/blob/$branch/$rel#L$line"
  fi

  choice=$(
    printf "%s\n" \
      "copy hash" \
      "copy blame" \
      "copy url (commit+line)" \
      "open commit" \
      "open url (branch+line)" \
    | fzf --prompt="blame:$line > " --height=40% --border
  ) || return

  case "$choice" in
    "copy hash") printf "%s" "$sha" | pbcopy ;;
    "copy blame") printf "%s" "$blame" | pbcopy ;;
    "copy url (commit+line)") printf "%s" "$url_line_commit" | pbcopy ;;
    "open commit") open "$url_commit" ;;
    "open url (branch+line)") open "$url_line_branch" ;;
  esac
}
