import pkg from "../package.json";
import { type Backend, type Operation, resolveCommand } from "./backend";

export interface ParsedArgs {
  action: "run" | "help" | "version";
  backend: Backend;
  backendArgs: string[];
}

export function parseArgs(args: readonly string[]): ParsedArgs {
  let backend: Backend = "auto";
  const backendArgs: string[] = [];
  let passthrough = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (passthrough) {
      backendArgs.push(arg);
      continue;
    }
    if (arg === "--") {
      passthrough = true;
    } else if (arg === "--help" || arg === "-h") {
      return { action: "help", backend, backendArgs: [] };
    } else if (arg === "--version" || arg === "-v") {
      return { action: "version", backend, backendArgs: [] };
    } else if (arg === "--backend") {
      const value = args[++index];
      if (!value) throw new Error("--backend requires a value");
      backend = parseBackend(value);
    } else if (arg.startsWith("--backend=")) {
      backend = parseBackend(arg.slice("--backend=".length));
    } else {
      backendArgs.push(arg);
    }
  }
  return { action: "run", backend, backendArgs };
}

function parseBackend(value: string): Backend {
  if (["auto", "native", "wayland", "x11"].includes(value)) return value as Backend;
  throw new Error(`invalid backend: ${value}`);
}

export function help(binary: string, operation: Operation): string {
  return `${binary}\n\n${operation === "copy" ? "Copy standard input to" : "Write"} the system clipboard${operation === "paste" ? " to standard output" : ""}.\n\nUsage:\n  ${binary} [--backend <auto|native|wayland|x11>] [-- backend-options]\n\nOptions:\n  --backend <name>  Override automatic backend selection\n  --help, -h        Show help\n  --version, -v     Show version\n`;
}

export async function run(
  operation: Operation,
  binary: string,
  args: readonly string[],
): Promise<number> {
  try {
    const parsed = parseArgs(args);
    if (parsed.action === "help") {
      process.stdout.write(help(binary, operation));
      return 0;
    }
    if (parsed.action === "version") {
      console.log(pkg.version);
      return 0;
    }
    const child = Bun.spawn([...resolveCommand(operation, parsed.backend), ...parsed.backendArgs], {
      stdin: operation === "copy" ? "inherit" : "ignore",
      stdout: "inherit",
      stderr: "inherit",
    });
    return await child.exited;
  } catch (error) {
    console.error(`${binary}: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}
