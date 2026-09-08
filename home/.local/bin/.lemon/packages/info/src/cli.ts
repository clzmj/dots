// Copyright © 2024, U.S. Graphics, LLC. BSD-3-Clause License.

import pkg from "../package.json";
import { collectMachineReport } from "./collectors";
import { createProbeContext } from "./context";
import { renderJSON } from "./renderers/json";
import { renderTable } from "./renderers/table";

export interface CliOptions {
  format: "table" | "json";
  strict: boolean;
  title?: string;
  action: "run" | "help" | "version";
}

export function parseArgs(args: readonly string[]): CliOptions {
  const options: CliOptions = { action: "run", format: "table", strict: false };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (arg === "--help" || arg === "-h") options.action = "help";
    else if (arg === "--version" || arg === "-v") options.action = "version";
    else if (arg === "--json") options.format = "json";
    else if (arg === "--strict") options.strict = true;
    else if (arg === "--title") {
      const title = args[++index];
      if (!title) throw new Error("--title requires a value");
      options.title = title;
    } else if (arg.startsWith("--title=")) {
      options.title = arg.slice("--title=".length);
      if (!options.title) throw new Error("--title requires a value");
    } else throw new Error(`unknown option: ${arg}`);
  }
  return options;
}

export function help(): string {
  return `lemon info\n\n${pkg.description}\n\nUsage:\n  lemon info [options]\n\nOptions:\n  --json           Render machine-readable JSON\n  --title <text>   Override the report title\n  --strict         Exit non-zero when a system probe fails\n  --help, -h       Show help\n  --version, -v    Show module version\n`;
}

export async function runInfo(args: readonly string[]): Promise<number> {
  try {
    const options = parseArgs(args);
    if (options.action === "help") {
      process.stdout.write(help());
      return 0;
    }
    if (options.action === "version") {
      console.log(pkg.version);
      return 0;
    }
    const context = createProbeContext();
    const report = await collectMachineReport(
      context,
      options.title === undefined ? {} : { title: options.title },
    );
    process.stdout.write(options.format === "json" ? renderJSON(report) : renderTable(report));
    if (options.strict && context.failures.size > 0) {
      console.error(`lemon info: failed probes: ${[...context.failures].toSorted().join(", ")}`);
      return 1;
    }
    return 0;
  } catch (error) {
    console.error(`lemon info: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}

if (import.meta.main) process.exit(await runInfo(Bun.argv.slice(2)));
