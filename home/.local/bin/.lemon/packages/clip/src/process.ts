import { CliOption, ProcessIO } from "../../../shared/tokens";
import pkg from "../package.json";
import { Backend, Operation, resolveCommand } from "./backend";

export enum CliAction {
  Run = "run",
  Help = "help",
  Version = "version",
}

export interface ParsedArgs {
  action: CliAction;
  backend: Backend;
  backendArgs: string[];
}

export function parseArgs(args: readonly string[]): ParsedArgs {
  let backend: Backend = Backend.Auto;
  const backendArgs: string[] = [];
  let passthrough = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (passthrough) {
      backendArgs.push(arg);
      continue;
    }
    if (arg === CliOption.Separator) {
      passthrough = true;
    } else if (arg === CliOption.Help || arg === CliOption.HelpShort) {
      return { action: CliAction.Help, backend, backendArgs: [] };
    } else if (arg === CliOption.Version || arg === CliOption.VersionShort) {
      return { action: CliAction.Version, backend, backendArgs: [] };
    } else if (arg === CliOption.Backend) {
      const value = args[++index];
      if (!value) throw new Error("--backend requires a value");
      backend = parseBackend(value);
    } else if (arg.startsWith(`${CliOption.Backend}=`)) {
      backend = parseBackend(arg.slice(`${CliOption.Backend}=`.length));
    } else {
      backendArgs.push(arg);
    }
  }
  return { action: CliAction.Run, backend, backendArgs };
}

function parseBackend(value: string): Backend {
  const backend = Object.values(Backend).find((candidate) => candidate === value);
  if (backend !== undefined) return backend;
  throw new Error(`invalid backend: ${value}`);
}

export function help(binary: string, operation: Operation): string {
  return `${binary}\n\n${operation === Operation.Copy ? "Copy standard input to" : "Write"} the system clipboard${operation === Operation.Paste ? " to standard output" : ""}.\n\nUsage:\n  ${binary} [${CliOption.Backend} <${Object.values(Backend).join("|")}>] [${CliOption.Separator} backend-options]\n\nOptions:\n  ${CliOption.Backend} <name>  Override automatic backend selection\n  ${CliOption.Help}, ${CliOption.HelpShort}        Show help\n  ${CliOption.Version}, ${CliOption.VersionShort}     Show version\n`;
}

export async function run(
  operation: Operation,
  binary: string,
  args: readonly string[],
): Promise<number> {
  try {
    const parsed = parseArgs(args);
    if (parsed.action === CliAction.Help) {
      process.stdout.write(help(binary, operation));
      return 0;
    }
    if (parsed.action === CliAction.Version) {
      console.log(pkg.version);
      return 0;
    }
    const child = Bun.spawn([...resolveCommand(operation, parsed.backend), ...parsed.backendArgs], {
      stdin: operation === Operation.Copy ? ProcessIO.Inherit : ProcessIO.Ignore,
      stdout: ProcessIO.Inherit,
      stderr: ProcessIO.Inherit,
    });
    return await child.exited;
  } catch (error) {
    console.error(`${binary}: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}
