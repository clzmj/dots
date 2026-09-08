# dots

One repo, one bootstrap, any Mac or supported Linux box.

```sh
curl -fsSL https://raw.githubusercontent.com/clzmj/dots/main/setup.sh | sh
```

The bootstrap is deliberately tiny POSIX shell: it detects macOS, Debian,
Fedora, or Arch; installs the few download prerequisites; guarantees Bun 1.4
or newer; and hands control to the typed Bun setup. A complete setup also
verifies that zsh is the account's login shell. Everything displaced by
setup is recoverable from `~/.dots-backup/<timestamp>/`.

## How it works

Files under `home/` mirror `$HOME` and are symlinked, not copied. Editing
`~/.config/helix/config.toml`, for example, edits the checked-out repo directly.
The only generated file is `~/.config/git/local`, containing the name and email
collected during setup.

```text
home/                   files linked into $HOME
home/.local/bin/lemon    Bun CLI installed by the normal dotfile linking pass
src/setup.ts            configuration, backup, linking, and stale-link cleanup
src/packages.ts         stable public entry point for package setup
src/packages/install.ts shared package orchestration and installer mechanics
src/packages/platforms/ isolated inventories and install plans for each OS
src/packages/types.ts   shared package setup contracts
src/lib/process.ts      subprocess, timeout, and concurrency primitives
setup.sh                prerequisite/Bun/checkout bootstrap only
```

Re-running setup is idempotent. If a destination already exists, setup lists
all conflicts once and either preserves them or moves them to the timestamped
backup before linking the repository version. Dangling links that still point
into this repo are pruned; unrelated links are untouched.

## Concurrency model

The package installer uses concurrency only where operations are independent:

- a distro's native package manager remains serialized to avoid lock races;
- independent release downloads and vendor installers run concurrently;
- Cargo, Go, and Bun tool groups run concurrently, while commands within each
  ecosystem stay ordered;
- subprocess groups are terminated and awaited together, with escalation for
  children that ignore `SIGTERM`.

This gives the setup real parallelism without letting `apt`, `dnf`, `pacman`,
or Homebrew compete with themselves.

## Configuration and unattended runs

Setup asks for a Git name and email. Each value comes from the first available
source: `DOTS_NAME` / `DOTS_EMAIL`, the cached answer, an interactive reply, or
the default. Answers are stored in `~/.config/dots/answers`.

With no TTY—or with `DOTS_YES=1`—setup never blocks. Useful controls are:

```sh
DOTS_SKIP_PACKAGES=1 ./setup.sh # link config; Bun is still foundational
DOTS_DRY_RUN=1 ./setup.sh       # print the package/link plan without changing it
DOTS_BUN_VERSION=bun-v1.4.0 ./setup.sh
```

## Testing

The local suite runs Bun tests in parallel and isolated processes, plus syntax
validation for the POSIX bootstrap:

```sh
bun run format # apply Oxfmt formatting
bun run lint   # run Oxlint on typed files and extensionless Bun commands
bun run check
```

The integration matrix builds and starts Debian, Fedora, and Arch containers
together. Each container validates its own detected package plan as well as the
shared setup and helper tests:

```sh
bun run test:docker
```

## Package inventory notes

The inventory keeps platform-specific naming and release behavior explicit:

- Debian receives upstream `fd`, `bat`, and `bottom` packages where repository
  names or binaries differ, and does not install the unrelated `delta` package.
- Arch uses `github-cli`; Helix is tested by its `hx` executable.
- A downloaded Helix release includes its required `runtime/` directory.
- Bun global tools are installed with Bun and node-style launcher shebangs are
  wrapped when Node is absent. Lemon is part of the mirrored dotfiles tree and
  is linked directly into `~/.local/bin`.

Bun itself is installed before this inventory is evaluated, so the setup,
helpers, downloads, archive extraction, tests, and subprocess orchestration all
share one runtime from the beginning.

## Command-line tools

Lemon lives at [`home/.local/bin/lemon`](home/.local/bin/lemon), with private
modules beside it under `home/.local/bin/.lemon`. The normal setup linking pass
installs it at `~/.local/bin/lemon`; setup does not fetch or globally install
any `@lemonaid-dev/*` packages.

```sh
lemon --help
```

`nd` and `rehash-completions` remain Zsh functions because they must mutate the
calling shell; a child process cannot change its parent's directory or rebuild
its completion state. The portable tool PATH lives in `~/.zshenv`, so the same
user install locations work in interactive sessions and one-shot SSH commands
on macOS and Linux. `tree` is a shell alias over the shared `eza` package.

## Local-only data

The repository contains no keys or credentials. Machine-specific shell config
belongs in `~/.config/zsh/local.zsh`, which is loaded but untracked. Git's
tracked config lives under `~/.config/git/`, while identity remains in the
generated, untracked `local` include.
