import pkg from "../package.json";
import { OpenBackendError, openTargets } from "./index.ts";

export interface CliIO {
  readonly out: (message: string) => void;
  readonly error: (message: string) => void;
}

const defaultIO: CliIO = {
  out: console.log,
  error: console.error,
};

function help(io: CliIO): void {
  io.out(`lemon open

${pkg.description}

Usage:
  lemon open [--] TARGET...

Options:
  --help, -h       Show help
  --version, -v    Show version`);
}

export async function runOpen(args: readonly string[], io: CliIO = defaultIO): Promise<number> {
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    help(io);
    return 0;
  }
  if (args[0] === "--version" || args[0] === "-v") {
    io.out(pkg.version);
    return 0;
  }

  const separator = args[0] === "--";
  const targets = separator ? args.slice(1) : args;
  if (targets.length === 0) {
    io.error("lemon open: at least one target is required after --");
    return 2;
  }
  if (!separator) {
    const option = targets.find((target) => target.startsWith("-"));
    if (option) {
      io.error(`lemon open: unknown option: ${option}`);
      return 2;
    }
  }

  try {
    return await openTargets(targets);
  } catch (error) {
    io.error(`lemon open: ${error instanceof Error ? error.message : String(error)}`);
    return error instanceof OpenBackendError ? 127 : 1;
  }
}

if (import.meta.main) process.exit(await runOpen(Bun.argv.slice(2)));
