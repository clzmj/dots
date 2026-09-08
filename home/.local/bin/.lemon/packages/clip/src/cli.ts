import pkg from "../package.json";
import { run } from "./process";

export function help(): string {
  return `lemon clip

${pkg.description}

Usage:
  lemon clip copy [options]
  lemon clip paste [options]

Commands:
  copy             Copy standard input to the system clipboard
  paste            Write the system clipboard to standard output

Options:
  --help, -h       Show help
  --version, -v    Show module version`;
}

export async function runClip(args: readonly string[]): Promise<number> {
  const [operation, ...rest] = args;
  if (!operation || operation === "--help" || operation === "-h") {
    console.log(help());
    return 0;
  }
  if (operation === "--version" || operation === "-v") {
    console.log(pkg.version);
    return 0;
  }
  if (operation === "copy" || operation === "paste") {
    return run(operation, `lemon clip ${operation}`, rest);
  }
  console.error(`lemon clip: unknown command: ${operation}`);
  return 2;
}

if (import.meta.main) process.exit(await runClip(Bun.argv.slice(2)));
