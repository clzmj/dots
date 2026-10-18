import { CliOption, DurationUnit } from "../../../shared/tokens.ts";
import { createInterface } from "node:readline/promises";

import pkg from "../package.json";
import {
  defaultSystem,
  discoverServers,
  formatServerTable,
  parseSelection,
  SelectionCommand,
  stopServers,
  type Server,
  type SystemAdapter,
} from "./ports";

const HELP = `lemon ports

${pkg.description}

Usage:
  lemon ports [--json] [--all] [--verbose]
  lemon ports list [--json] [--all] [--verbose]
  lemon ports stop [--port <port>]... [--all] [--yes] [--timeout <duration>] [--no-kill]

Commands:
  list              List detected development servers
  stop              Stop selected development servers

Options:
  --port <port>     Select a listening port (repeatable)
  --all             Include all listeners with list, or select all detected servers with stop
  --yes, -y         Skip confirmation
  --timeout <time>  Wait before SIGKILL (default: 3s; accepts ms, s, or plain milliseconds)
  --no-kill         Do not escalate from SIGTERM to SIGKILL
  --json            Print machine-readable list output
  --verbose         Do not truncate commands
  --help, -h        Show help
  --version, -v     Show module version
`;

export enum ActionKind {
  Help = "help",
  Version = "version",
  List = "list",
  Stop = "stop",
}

type Action =
  | { kind: ActionKind.Help }
  | { kind: ActionKind.Version }
  | { kind: ActionKind.List; json: boolean; includeAll: boolean; verbose: boolean }
  | {
      kind: ActionKind.Stop;
      ports: number[];
      all: boolean;
      yes: boolean;
      timeoutMs: number;
      killAfterTimeout: boolean;
    };

export interface CliDependencies {
  system?: SystemAdapter;
  ask?: (question: string) => Promise<string>;
  log?: (message: string) => void;
  error?: (message: string) => void;
}

export function parseCli(args: readonly string[]): Action {
  if (args.length === 0)
    return { kind: ActionKind.List, json: false, includeAll: false, verbose: false };
  const command = args[0];
  if (command === CliOption.Help || command === CliOption.HelpShort)
    return { kind: ActionKind.Help };
  if (command === CliOption.Version || command === CliOption.VersionShort)
    return { kind: ActionKind.Version };

  if (command === ActionKind.List || command?.startsWith("-")) {
    let json = false;
    let includeAll = false;
    let verbose = false;
    const options = command === ActionKind.List ? args.slice(1) : args;
    for (const option of options) {
      if (option === CliOption.Json) json = true;
      else if (option === CliOption.All) includeAll = true;
      else if (option === CliOption.Verbose) verbose = true;
      else throw new Error(`unknown option for list: ${option}`);
    }
    return { kind: ActionKind.List, json, includeAll, verbose };
  }

  if (command === ActionKind.Stop) {
    const ports: number[] = [];
    let all = false;
    let yes = false;
    let timeoutMs = 3_000;
    let killAfterTimeout = true;
    for (let index = 1; index < args.length; index += 1) {
      const option = args[index];
      if (option === CliOption.Port) {
        const value = args[++index];
        const port = value === undefined ? Number.NaN : Number(value);
        if (!Number.isInteger(port) || port < 1 || port > 65_535) {
          throw new Error("--port requires a number between 1 and 65535");
        }
        ports.push(port);
      } else if (option === CliOption.All) all = true;
      else if (option === CliOption.Yes || option === CliOption.YesShort) yes = true;
      else if (option === CliOption.Timeout) {
        const value = args[++index];
        if (value === undefined) throw new Error("--timeout requires a duration");
        timeoutMs = parseDuration(value);
      } else if (option === CliOption.NoKill) killAfterTimeout = false;
      else throw new Error(`unknown option for stop: ${String(option)}`);
    }
    if (all && ports.length > 0) throw new Error("use either --all or --port, not both");
    return {
      kind: ActionKind.Stop,
      ports: [...new Set(ports)],
      all,
      yes,
      timeoutMs,
      killAfterTimeout,
    };
  }

  throw new Error(`unknown command: ${command}`);
}

export function parseDuration(value: string): number {
  const match = value.match(/^(\d+(?:\.\d+)?)(ms|s)?$/);
  if (!match?.[1]) throw new Error(`invalid duration: ${value}`);
  const amount = Number(match[1]);
  const milliseconds = match[2] === DurationUnit.Second ? amount * 1_000 : amount;
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    throw new Error(`invalid duration: ${value}`);
  }
  return milliseconds;
}

export async function runPorts(
  args: readonly string[],
  dependencies: CliDependencies = {},
): Promise<number> {
  const log = dependencies.log ?? console.log;
  const error = dependencies.error ?? console.error;
  let action: Action;
  try {
    action = parseCli(args);
  } catch (cause) {
    error(`lemon ports: ${message(cause)}`);
    error("Run 'lemon ports --help' for usage.");
    return 2;
  }

  if (action.kind === ActionKind.Help) {
    log(HELP.trimEnd());
    return 0;
  }
  if (action.kind === ActionKind.Version) {
    log(pkg.version);
    return 0;
  }

  const system = dependencies.system ?? defaultSystem;
  try {
    if (action.kind === ActionKind.List) {
      const servers = await discoverServers(system, action.includeAll);
      log(action.json ? JSON.stringify(servers, null, 2) : renderServers(servers, action.verbose));
      return 0;
    }

    const servers = await discoverServers(system);
    if (servers.length === 0) {
      log("No running development server processes found.");
      return 0;
    }

    let selected: Server[];
    let shouldConfirm = true;
    let timeoutMs = 3_000;
    let killAfterTimeout = true;

    timeoutMs = action.timeoutMs;
    killAfterTimeout = action.killAfterTimeout;
    shouldConfirm = !action.yes;
    if (action.all) selected = [...servers];
    else if (action.ports.length > 0) {
      selected = servers.filter((server) =>
        action.ports.some((port) => server.ports.includes(port)),
      );
      if (selected.length === 0) {
        log(`No detected development server listens on: ${action.ports.join(", ")}`);
        return 0;
      }
    } else selected = await selectInteractively(servers, dependencies, log);

    if (selected.length === 0) return 0;
    if (shouldConfirm) {
      const answer = await ask(
        `Send SIGTERM to PIDs ${selected.map(({ pid }) => pid).join(", ")}? (y/N): `,
        dependencies,
      );
      if (!/^y(?:es)?$/i.test(answer.trim())) {
        log("Aborted.");
        return 0;
      }
    }

    const result = await stopServers(selected, system, { timeoutMs, killAfterTimeout });
    if (result.terminated.length > 0) log(`Stopped with SIGTERM: ${result.terminated.join(", ")}`);
    if (result.killed.length > 0) log(`Stopped with SIGKILL: ${result.killed.join(", ")}`);
    if (result.stale.length > 0) {
      error(`Refused changed or exited processes: ${result.stale.join(", ")}`);
    }
    for (const failure of result.failed) error(`PID ${failure.pid}: ${failure.error}`);
    return result.stale.length > 0 || result.failed.length > 0 ? 1 : 0;
  } catch (cause) {
    error(`lemon ports: ${message(cause)}`);
    return 1;
  }
}

async function selectInteractively(
  servers: readonly Server[],
  dependencies: CliDependencies,
  log: (message: string) => void,
): Promise<Server[]> {
  log(renderServers(servers));
  const answer = await ask("Select processes (1,3-5 or all; q to quit): ", dependencies);
  const selection = answer.trim().toLowerCase();
  if (selection === SelectionCommand.Quit || selection === SelectionCommand.QuitShort) return [];
  const indexes = parseSelection(answer, servers.length);
  return indexes.map((index) => servers[index]).filter((server): server is Server => !!server);
}

async function ask(question: string, dependencies: CliDependencies): Promise<string> {
  if (dependencies.ask) return dependencies.ask(question);
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await readline.question(question);
  } finally {
    readline.close();
  }
}

function renderServers(servers: readonly Server[], verbose = false): string {
  return servers.length === 0
    ? "No running development server processes found."
    : formatServerTable(servers, verbose);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (import.meta.main) process.exit(await runPorts(Bun.argv.slice(2)));
