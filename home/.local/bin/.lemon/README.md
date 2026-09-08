# lemon

Small, sharp tools for everyday development. Lemon combines the former Lemonaid
utility CLIs behind one short executable while keeping every command isolated and
independently testable.

## Dotfiles install

```sh
./setup.sh
```

The dotfiles setup links `home/.local/bin/lemon` and its private `.lemon`
modules into `~/.local/bin`. Lemon runs directly on the Bun runtime installed by
the bootstrap; it has no package-registry or GitLab dependency.

## Commands

```text
lemon repo     Open, print, or copy Git repository links
lemon open     Open files and URLs with the platform application
lemon clip     Copy to or paste from the system clipboard
lemon ports    List and stop local development servers
lemon run      Run a command and notify when it finishes
lemon info     Show a portable machine report
lemon tree     Show an opinionated eza directory tree
```

Run `lemon help <command>` for command-specific help.

## Develop

```sh
bun install --frozen-lockfile
bun run check
```

## Requirements

- Bun is required at runtime.
- `git` is required by `lemon repo`.
- `fzf` is required only for the interactive `lemon repo blame` menu.
- `eza` is required by `lemon tree`.
- Linux clipboard support requires `wl-clipboard` or `xclip`.
- `lsof` is required by `lemon ports`.

## License

Lemonaid-owned code is MIT licensed. The machine-report-derived implementation
under `packages/info` remains BSD-3-Clause; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
