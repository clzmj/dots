import pkg from "../package.json";
import { blameHelp, runBlame } from "./commands/blame.ts";
import { runOpen } from "./commands/open.ts";

export function help(): string {
  return `lemon repo

${pkg.description}

Usage:
  lemon repo [PATH] [options]
  lemon repo blame FILE LINE [options]

Commands:
  blame            Inspect and act on one blamed line

Link actions (choose one):
  --open            Open the URL (default)
  --print           Print the URL
  --copy            Copy the URL

Link options:
  --remote NAME     Select a Git remote
  --ref REF         Select a branch, tag, or commit
  --provider NAME   github or gitlab
  --line NUMBER     Link to one file line
  --lines START:END Link to a file line range

General options:
  --help, -h       Show help
  --version, -v    Show module version`;
}

export async function runRepo(args: readonly string[]): Promise<number> {
  const command = args[0];
  if (command === "--help" || command === "-h") {
    console.log(help());
    return 0;
  }
  if (command === "--version" || command === "-v") {
    console.log(pkg.version);
    return 0;
  }
  if (command === "blame") {
    if (args[1] === "--help" || args[1] === "-h") {
      console.log(blameHelp());
      return 0;
    }
    return runBlame(args.slice(1));
  }
  return runOpen(args, {}, "lemon repo");
}

if (import.meta.main) process.exit(await runRepo(Bun.argv.slice(2)));
