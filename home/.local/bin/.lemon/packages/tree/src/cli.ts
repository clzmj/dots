import pkg from "../package.json";

export const defaultIgnores = [
  "__pycache__",
  ".DS_Store",
  ".git",
  ".next",
  ".ruff_cache",
  ".svelte-kit",
  ".terraform",
  ".venv",
  "node_modules",
  "target",
  "venv",
] as const;

export type ParsedArgs =
  | { action: "help" }
  | { action: "version" }
  | { action: "run"; ignores: string[]; ezaArgs: string[] };

export function parseArgs(args: readonly string[]): ParsedArgs {
  let useDefaults = true;
  const customIgnores: string[] = [];
  const ezaArgs: string[] = [];
  let passthrough = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (passthrough) {
      ezaArgs.push(arg);
    } else if (arg === "--") {
      passthrough = true;
    } else if (arg === "--help" || arg === "-h") {
      return { action: "help" };
    } else if (arg === "--version" || arg === "-v") {
      return { action: "version" };
    } else if (arg === "--no-default-ignore") {
      useDefaults = false;
    } else if (arg === "--ignore") {
      const value = args[++index];
      if (!value) throw new Error("--ignore requires a glob");
      customIgnores.push(value);
    } else if (arg.startsWith("--ignore=")) {
      const value = arg.slice("--ignore=".length);
      if (!value) throw new Error("--ignore requires a glob");
      customIgnores.push(value);
    } else {
      ezaArgs.push(arg);
    }
  }
  return {
    action: "run",
    ignores: [...(useDefaults ? defaultIgnores : []), ...customIgnores],
    ezaArgs,
  };
}

export function ezaCommand(parsed: Extract<ParsedArgs, { action: "run" }>): string[] {
  const command = ["eza", "--tree", "--all", "--git"];
  if (parsed.ignores.length > 0) command.push("--ignore-glob", parsed.ignores.join("|"));
  return [...command, ...parsed.ezaArgs];
}

export function help(): string {
  return `lemon tree\n\n${pkg.description}\n\nUsage:\n  lemon tree [options] [eza-options] [path]\n\nOptions:\n  --ignore <glob>       Add an exclusion (repeatable)\n  --no-default-ignore   Disable built-in exclusions\n  --help, -h            Show help\n  --version, -v         Show module version\n\nOther arguments are passed to eza.\n`;
}

export async function runTree(args: readonly string[]): Promise<number> {
  try {
    const parsed = parseArgs(args);
    if (parsed.action === "help") {
      process.stdout.write(help());
      return 0;
    }
    if (parsed.action === "version") {
      console.log(pkg.version);
      return 0;
    }
    if (!Bun.which("eza"))
      throw new Error("eza is required; install it with your system package manager");
    const child = Bun.spawn(ezaCommand(parsed), {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });
    return await child.exited;
  } catch (error) {
    console.error(`lemon tree: ${error instanceof Error ? error.message : String(error)}`);
    return error instanceof Error && error.message.startsWith("eza is required") ? 127 : 2;
  }
}

if (import.meta.main) process.exit(await runTree(Bun.argv.slice(2)));
