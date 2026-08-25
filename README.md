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
home/      mirrors $HOME exactly — home/.config/git/config -> ~/.config/git/config
packages.txt                    what gets installed
setup.sh                        installs, links, asks two questions
```

Re-run `setup.sh` (or `sysupdate`) after pulling to pick up new files.

## No templating

Two mechanisms replace it:

- **Shell config** branches at runtime on `$OSTYPE`.
- **Everything else** uses its own include mechanism — `[include]` in git,
  `Include` in ssh.

The one exception is `home/.config/helix/languages.toml.in`: helix won't expand `~`,
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

## packages.sh

Not a config format — a shell script. `sh -n packages.sh` checks it, and the
install commands are written out per platform exactly as you would type them:

```sh
case $PLATFORM in            # darwin | debian | fedora | arch
debian)
  sudo apt-get install -y zsh git curl ripgrep eza fzf jq git-delta ...
  have fd  || deb sharkdp/fd  'fd_${V}_${DEB_ARCH}.deb'
  have bat || deb sharkdp/bat 'bat_${V}_${DEB_ARCH}.deb'
  ;;
esac
```

Helpers: `have`, `deb`, `rpm`, `bin`, `tarbin`, `helix_release`, `go_release`,
`go_install`, `bun_install`. Single-quote a release asset name and use ordinary
shell variables in it — `$V`, `$DEB_ARCH`, `$RPM_ARCH`, `$ARCH`, `$ARCH2`.

The platform's own packages come **first**, because they provide the `curl`,
`unzip` and `xz` that the vendor installers below them need — bun's aborts
outright without `unzip`.

Verified installing every tool on Debian 13, Fedora 44 and Arch, with no
Homebrew anywhere.

### Traps this encodes

- Debian renames binaries: `fd-find`→`fdfind`, `bat`→`batcat`. Both would break
  `alias cat='bat'`, so those take upstream's `.deb` instead.
- `apt install delta` installs a completely unrelated tool.
- Arch calls the GitHub CLI `github-cli`, and names helix's binary `helix`
  because `hex` already owns `hx`.
- helix without its `runtime/` directory starts up **silently** broken.
- `bottom` is in no Debian or Fedora repo and its binary is `btm`.
- bun's globals need a JS runtime, and bun is it — no node install required.

## No templating

There are no `.in` files and no placeholders. Config values are simply
committed, because **these files are symlinks into the repo** — editing
`~/.config/helix/config.toml` *is* editing the repo, so a template would only
protect you from the thing the design already makes trivial.

Tool configs live where each tool natively looks for them — `~/.config/ruff/ruff.toml`
and `~/.config/sqlfluff/.sqlfluff` — so nothing needs an absolute path baked in, and per-project
configs take precedence the way they should.

The only generated file is `~/.config/git/local`, from two prompts.

## Scripts

Standalone helpers live in `home/.local/bin/` as real executables, not shell
functions: `www`, `blame-menu`, `kserver`, `notify`, `tree`, `sysupdate`, and
`machine-report`.

`nd` and `rehash-completions` stay functions in `home/.config/zsh/` because they
have to act on the calling shell — a subprocess cannot `cd` for you or run
`compinit` in your shell.

## No oh-my-zsh

Startup went 170ms → ~70ms. omz's `git` plugin was the only part earning its
keep; the eight aliases actually used live in `home/.config/zsh/git.zsh`, and the
directory aliases in `home/.config/zsh/nav.zsh`.

`zshrc` runs `compinit -C`, which skips the completion-dump staleness check —
that check alone was 114ms. Run `rehash-completions` after installing tools
that ship new completions.
