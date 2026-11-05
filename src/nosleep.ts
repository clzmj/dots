import { runChecked, type CommandRunner } from "./lib/process";
import { Executable } from "./lib/tokens";
import { Platform } from "./packages";

// Keep all privileged file operations in system directories, including when the
// checkout is in Documents (which macOS can deny to privileged subprocesses).
const installRule = `set -eu
destination=/private/etc/sudoers.d/nosleep
umask 077
temporary=$(/usr/bin/mktemp /private/etc/sudoers.d/.nosleep.XXXXXX)
trap '/bin/rm -f "$temporary"' EXIT
printf '%s\\n' '# Passwordless access only for the nosleep toggle.' "$1 ALL=(root) NOPASSWD: /usr/bin/pmset disablesleep 0, /usr/bin/pmset disablesleep 1" > "$temporary"
/usr/sbin/chown root:wheel "$temporary"
/bin/chmod 0440 "$temporary"
/usr/sbin/visudo -cf "$temporary"
if [ -e "$destination" ] || [ -L "$destination" ]; then
  if [ ! -L "$destination" ] && /usr/bin/cmp -s "$temporary" "$destination"; then
    /usr/sbin/visudo -c
    exit 0
  fi
  echo 'Refusing to replace a different /etc/sudoers.d/nosleep rule.' >&2
  exit 1
fi
/bin/mv "$temporary" "$destination"
if ! /usr/sbin/visudo -c; then
  /bin/rm "$destination"
  exit 1
fi`;

export async function setupNoSleep(options: {
  platform: Platform;
  runner: CommandRunner;
  env: Record<string, string | undefined>;
  dryRun: boolean;
  interactive: boolean;
  log: (message: string) => void;
}): Promise<void> {
  const { platform, runner, env, dryRun, interactive, log } = options;
  if (platform !== Platform.Darwin) return;

  const identity = await runChecked(runner, [Executable.Id, "-un"], { env });
  const user = identity.stdout.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(user))
    throw new Error("cannot configure nosleep for an invalid account name");
  if (dryRun) {
    log(`[plan] enable passwordless nosleep for ${user} (only pmset disablesleep 0 and 1)`);
    return;
  }

  log("configuring passwordless nosleep (only pmset disablesleep 0 and 1)");
  // Preserve the controlling terminal so sudo can reuse its authorization.
  const authorization = await runner.run([Executable.Sudo, "-n", "-v"], { env, detached: false });
  if (authorization.exitCode === 0) {
    await runChecked(runner, [Executable.Sudo, "-n", "/bin/sh", "-c", installRule, "--", user], {
      env,
      detached: false,
    });
  } else if (interactive) {
    // Pass only validated account text into the shell. Escape the complete shell
    // command as an AppleScript string; no privileged read of the checkout.
    const command = `/bin/sh -c '${installRule.replaceAll("'", "'\\''")}' -- '${user}'`;
    const script = `do shell script ${JSON.stringify(command)} with administrator privileges`;
    await runChecked(runner, ["/usr/bin/osascript", "-e", script], { env });
  } else {
    throw new Error(
      "passwordless nosleep setup requires administrator access; run sudo -v and retry",
    );
  }
}
