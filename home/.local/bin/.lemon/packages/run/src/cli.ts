import pkg from "../package.json";
import {
  defaultRuntime,
  runAndNotify,
  terminalNotifier,
  type CommandRuntime,
  type NotificationCondition,
  type Notifier,
} from "./runner";

const HELP = `lemon run

${pkg.description}

Usage:
  lemon run [options] -- <command> [args...]
  lemon run <command> [args...]

Options:
  --on <when>       Notify always, on success, or on failure (default: always)
  --after <time>    Notify only after this duration (accepts ms, s, m, or h)
  --title <text>    Override the command name used as notification title
  --always-zero     Return 0 instead of preserving the command exit status
  --help, -h        Show help
  --version, -v     Show module version

Commands run directly, without a shell. Use 'sh -lc' explicitly when shell
syntax such as pipes, redirects, or glob expansion is required.
`;

type Action =
  | { kind: "help" }
  | { kind: "version" }
  | {
      kind: "run";
      command: string[];
      condition: NotificationCondition;
      afterMs: number;
      title: string | undefined;
      alwaysZero: boolean;
    };

export interface CliDependencies {
  runtime?: CommandRuntime;
  notifier?: Notifier;
  log?: (message: string) => void;
  error?: (message: string) => void;
}

export function parseCli(args: readonly string[]): Action {
  if (args.length === 0) throw new Error("a command is required");
  if (args[0] === "--help" || args[0] === "-h") return { kind: "help" };
  if (args[0] === "--version" || args[0] === "-v") return { kind: "version" };

  let condition: NotificationCondition = "always";
  let afterMs = 0;
  let title: string | undefined;
  let alwaysZero = false;
  let index = 0;

  while (index < args.length) {
    const argument = args[index];
    if (argument === "--") {
      index += 1;
      break;
    }
    if (argument === "--on") {
      const value = args[index + 1];
      if (value !== "always" && value !== "success" && value !== "failure") {
        throw new Error("--on requires always, success, or failure");
      }
      condition = value;
      index += 2;
      continue;
    }
    if (argument === "--after") {
      const value = args[index + 1];
      if (value === undefined) throw new Error("--after requires a duration");
      afterMs = parseDuration(value);
      index += 2;
      continue;
    }
    if (argument === "--title") {
      title = args[index + 1];
      if (title === undefined) throw new Error("--title requires text");
      index += 2;
      continue;
    }
    if (argument === "--always-zero") {
      alwaysZero = true;
      index += 1;
      continue;
    }
    if (argument?.startsWith("-")) throw new Error(`unknown option: ${argument}`);
    break;
  }

  const command = args.slice(index);
  if (command.length === 0) throw new Error("a command is required");
  return { kind: "run", command: [...command], condition, afterMs, title, alwaysZero };
}

export function parseDuration(value: string): number {
  const match = value.match(/^(\d+(?:\.\d+)?)(ms|s|m|h)?$/);
  if (!match?.[1]) throw new Error(`invalid duration: ${value}`);
  const amount = Number(match[1]);
  const multiplier =
    match[2] === "s" ? 1_000 : match[2] === "m" ? 60_000 : match[2] === "h" ? 3_600_000 : 1;
  const milliseconds = amount * multiplier;
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    throw new Error(`invalid duration: ${value}`);
  }
  return milliseconds;
}

export async function runCommand(
  args: readonly string[],
  dependencies: CliDependencies = {},
): Promise<number> {
  const log = dependencies.log ?? console.log;
  const error = dependencies.error ?? console.error;
  let action: Action;
  try {
    action = parseCli(args);
  } catch (cause) {
    error(`lemon run: ${message(cause)}`);
    error("Run 'lemon run --help' for usage.");
    return 2;
  }

  if (action.kind === "help") {
    log(HELP.trimEnd());
    return 0;
  }
  if (action.kind === "version") {
    log(pkg.version);
    return 0;
  }

  const result = await runAndNotify(
    action.command,
    {
      condition: action.condition,
      afterMs: action.afterMs,
      ...(action.title === undefined ? {} : { title: action.title }),
    },
    dependencies.runtime ?? defaultRuntime,
    dependencies.notifier ?? terminalNotifier,
  );
  if (result.error) error(`lemon run: ${result.error}`);
  return action.alwaysZero ? 0 : result.status;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (import.meta.main) process.exit(await runCommand(Bun.argv.slice(2)));
