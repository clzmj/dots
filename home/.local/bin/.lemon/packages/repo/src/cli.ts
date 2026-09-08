import pkg from "../package.json";
import { blameHelp, runBlame } from "./commands/blame.ts";
import { openHelp, runOpen } from "./commands/open.ts";

export function help(): string {
  return `lemon repo

${pkg.description}

Usage:
  lemon repo open [PATH] [options]
  lemon repo blame FILE LINE [options]

Commands:
  open             Open, print, or copy a repository resource URL
  blame            Inspect and act on one blamed line

Options:
  --help, -h       Show help
  --version, -v    Show module version`;
}

export async function runRepo(args: readonly string[]): Promise<number> {
  const command = args[0];
  if (!command || command === "--help" || command === "-h") {
    console.log(help());
    return 0;
  }
  if (command === "--version" || command === "-v") {
    console.log(pkg.version);
    return 0;
  }
  if (command === "open") {
    if (args[1] === "--help" || args[1] === "-h") {
      console.log(openHelp());
      return 0;
    }
    return runOpen(args.slice(1));
  }
  if (command === "blame") {
    if (args[1] === "--help" || args[1] === "-h") {
      console.log(blameHelp());
      return 0;
    }
    return runBlame(args.slice(1));
  }
  console.error(`lemon repo: unknown command: ${command}`);
  return 2;
}

if (import.meta.main) process.exit(await runRepo(Bun.argv.slice(2)));
