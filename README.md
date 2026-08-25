# dots

One repo, one script, any Mac or Linux box.

```sh
curl -fsSL https://raw.githubusercontent.com/clzmj/dots/main/setup.sh | sh
```

Idempotent. Anything it displaces goes to `~/.dots-backup/<timestamp>/`.

## How it works

Files are **symlinked**, not copied — so there is no source state, no target
state, no `apply`. Edit `~/.config/helix/config.toml` and you have edited the
repo. Commit and push; that's the whole workflow.

```
home/      → ~/.<name>          zshrc, zprofile
config/    → ~/.config/<name>   everything else
packages.txt                    what gets installed
setup.sh                        installs, links, asks two questions
```

Re-run `setup.sh` (or `sysupdate`) after pulling to pick up new files.

## No templating

Two mechanisms replace it:

- **Shell config** branches at runtime on `$OSTYPE`.
- **Everything else** uses its own include mechanism — `[include]` in git,
  `Include` in ssh.

The one exception is `config/helix/languages.toml.in`: helix won't expand `~`,
so `setup.sh` expands `@HOME@` into `~/.config/helix/languages.toml`. That file
is generated, not linked.

## What it asks

Five questions, each answered by the first of: a `DOTS_*` env var, a cached
answer, your typed reply, the default.

```
Full name (git commits) [Carlos Lezama]:
Email (git commits)     [carlos@example.com]:
Terminal font           [JetBrainsMonoNL Nerd Font Mono]:
Terminal font size      [12]:
Theme (helix + herdr)   [vesper]:
```

Answers cache to `~/.config/dots/answers`, so re-runs are silent. With no tty
(or `DOTS_YES=1`) it takes the defaults and never blocks.

If a file already exists, it lists the conflicts and asks **once** whether to
replace them. Declining keeps your files and links everything else.

## Testing

```sh
sh test.sh
```

Runs the whole matrix against throwaway homes — never touches your real
`$HOME`. Safe inside a container as a non-root user. Validated on macOS,
Debian 13, Fedora 44 and Arch.

## Nothing private is in here

No SSH keys, no AWS credentials, no encrypted blobs, no identity. `setup.sh`
asks for a git name and email once and writes `~/.config/git/local`, which is
`[include]`d and never committed. That is the only prompt.

Machine-specific shell bits: drop a `~/.config/zsh/local.zsh` — the loader
globs the directory, and it isn't tracked.

## Git lives in `~/.config/git/`

`config`, `ignore`, and `attributes` — git finds all three there by convention,
so `core.excludesFile` and `core.attributesFile` aren't set.

`zprofile` exports `GIT_CONFIG_GLOBAL`, which matters: git reads `~/.gitconfig`
*after* the XDG file and lets it win, so a stray `git config --global` would
silently shadow everything here. With `GIT_CONFIG_GLOBAL` set, `--global`
writes to the right file and `~/.gitconfig` never comes back.

## packages.txt

```
manager  package  [os]
```

`manager` is `tap`, `brew`, `cask`, `sys` (apt/dnf/pacman), `bun`, or `sh`
(a `bin` to check for and a command to run if it's missing). Omit `os` for both.

Keep it minimal — project tooling belongs in the project. Deliberately cut,
re-add if you miss them: `tmux` (replaced by herdr), `ollama`, `docker`,
`terraform`, `postgresql`, `rustup`, `deno`, `neovim`, and the LSPs and SDKs
for languages not in daily use.

## No oh-my-zsh

Startup went 170ms → ~30ms. omz's `git` plugin was the only part earning its
keep; the eight aliases actually used live in `config/zsh/git.zsh`, and the
directory aliases in `config/zsh/nav.zsh`.

`zshrc` runs `compinit -C`, which skips the completion-dump staleness check —
that check alone was 114ms. Run `rehash-completions` after installing tools
that ship new completions.
