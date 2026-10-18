import { CliOption } from "../../../shared/tokens";
import pkg from "../package.json";
import { Operation } from "./backend";
import { run } from "./process";

export function help(): string {
  return `lemon clip

${pkg.description}

Usage:
  lemon clip ${Operation.Copy} [options]
  lemon clip ${Operation.Paste} [options]

Commands:
  ${Operation.Copy}             Copy standard input to the system clipboard
  ${Operation.Paste}            Write the system clipboard to standard output

Options:
  ${CliOption.Help}, ${CliOption.HelpShort}       Show help
  ${CliOption.Version}, ${CliOption.VersionShort}    Show module version`;
}

export async function runClip(args: readonly string[]): Promise<number> {
  const [operation, ...rest] = args;
  if (!operation || operation === CliOption.Help || operation === CliOption.HelpShort) {
    console.log(help());
    return 0;
  }
  if (operation === CliOption.Version || operation === CliOption.VersionShort) {
    console.log(pkg.version);
    return 0;
  }
  if (operation === Operation.Copy || operation === Operation.Paste) {
    return run(operation, `lemon clip ${operation}`, rest);
  }
  console.error(`lemon clip: unknown command: ${operation}`);
  return 2;
}

if (import.meta.main) process.exit(await runClip(Bun.argv.slice(2)));
