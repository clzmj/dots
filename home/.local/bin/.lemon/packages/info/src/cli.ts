import { CliOption } from "../../../shared/tokens";
// Copyright © 2024, U.S. Graphics, LLC. BSD-3-Clause License.

import pkg from "../package.json";
import { collectMachineReport } from "./collectors";
import { createProbeContext } from "./context";
import { renderJSON } from "./renderers/json";
import { renderTable } from "./renderers/table";
import { CliAction, OutputFormat } from "./types";

export interface CliOptions {
  format: OutputFormat;
  strict: boolean;
  title?: string;
  action: CliAction;
}

export function parseArgs(args: readonly string[]): CliOptions {
  const options: CliOptions = { action: CliAction.Run, format: OutputFormat.Table, strict: false };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (arg === CliOption.Help || arg === CliOption.HelpShort) options.action = CliAction.Help;
    else if (arg === CliOption.Version || arg === CliOption.VersionShort)
      options.action = CliAction.Version;
    else if (arg === CliOption.Json) options.format = OutputFormat.JSON;
    else if (arg === CliOption.Strict) options.strict = true;
    else if (arg === CliOption.Title) {
      const title = args[++index];
      if (!title) throw new Error("--title requires a value");
      options.title = title;
    } else if (arg.startsWith(`${CliOption.Title}=`)) {
      options.title = arg.slice(`${CliOption.Title}=`.length);
      if (!options.title) throw new Error("--title requires a value");
    } else throw new Error(`unknown option: ${arg}`);
  }
  return options;
}

export function help(): string {
  return `lemon info\n\n${pkg.description}\n\nUsage:\n  lemon info [options]\n\nOptions:\n  ${CliOption.Json}           Render machine-readable JSON\n  ${CliOption.Title} <text>   Override the report title\n  ${CliOption.Strict}         Exit non-zero when a system probe fails\n  ${CliOption.Help}, ${CliOption.HelpShort}       Show help\n  ${CliOption.Version}, ${CliOption.VersionShort}    Show module version\n`;
}

export async function runInfo(args: readonly string[]): Promise<number> {
  try {
    const options = parseArgs(args);
    if (options.action === CliAction.Help) {
      process.stdout.write(help());
      return 0;
    }
    if (options.action === CliAction.Version) {
      console.log(pkg.version);
      return 0;
    }
    const context = createProbeContext();
    const report = await collectMachineReport(
      context,
      options.title === undefined ? {} : { title: options.title },
    );
    process.stdout.write(
      options.format === OutputFormat.JSON ? renderJSON(report) : renderTable(report),
    );
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
