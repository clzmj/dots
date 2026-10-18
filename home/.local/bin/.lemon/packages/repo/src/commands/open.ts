import { CliOption } from "../../../../shared/tokens.ts";
import { repositoryState } from "../git.ts";
import { provider } from "../providers/index.ts";
import type { LineRange } from "../providers/index.ts";
import {
  detectProvider,
  normalizeRemote,
  parseProviderName,
  type ProviderName,
} from "../remote.ts";
import { repositoryTarget, ResourceKind } from "../target.ts";
import {
  dependencies,
  positiveInteger,
  type CommandDependencies,
  type ResolvedDependencies,
} from "./shared.ts";

export enum OpenAction {
  Open = "open",
  Print = "print",
  Copy = "copy",
}

const actionOptions = new Map<string, OpenAction>([
  [CliOption.Open, OpenAction.Open],
  [CliOption.Print, OpenAction.Print],
  [CliOption.Copy, OpenAction.Copy],
]);

interface OpenArguments {
  action: OpenAction;
  path?: string;
  remote?: string;
  ref?: string;
  provider?: ProviderName;
  lines?: LineRange;
}

export function openHelp(program = "lemon repo"): string {
  return `Usage:
  ${program} [PATH] [options]

Actions (choose one):
  --open            Open the URL (default)
  --print           Print the URL
  --copy            Copy the URL

Options:
  --remote NAME     Select a Git remote
  --ref REF         Select a branch, tag, or commit
  --provider NAME   github or gitlab
  --line NUMBER     Link to one file line
  --lines START:END Link to a file line range
  --help, -h        Show help`;
}

function parse(args: readonly string[]): OpenArguments {
  const result: OpenArguments = { action: OpenAction.Open };
  let selectedAction = false;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]!;
    const action = actionOptions.get(argument);
    if (action !== undefined) {
      if (selectedAction) throw new Error("select only one of --open, --print, or --copy");
      result.action = action;
      selectedAction = true;
      continue;
    }
    const valueOption = [
      CliOption.Remote,
      CliOption.Ref,
      CliOption.Provider,
      CliOption.Line,
      CliOption.Lines,
    ].some((option) => option === argument);
    if (valueOption) {
      const value = args[++index];
      if (!value) throw new Error(`${argument} needs a value`);
      if (argument === CliOption.Remote) result.remote = value;
      else if (argument === CliOption.Ref) result.ref = value;
      else if (argument === CliOption.Provider) {
        result.provider = parseProviderName(value);
      } else if (argument === CliOption.Line) {
        result.lines = { start: positiveInteger(value, argument) };
      } else {
        const match = value.match(/^(\d+):(\d+)$/);
        if (!match) throw new Error("--lines needs START:END");
        const start = positiveInteger(match[1]!, argument);
        const end = positiveInteger(match[2]!, argument);
        if (end < start) throw new Error("--lines END must not be before START");
        result.lines = { start, end };
      }
      continue;
    }
    if (argument.startsWith("-")) throw new Error(`unknown option: ${argument}`);
    if (result.path) throw new Error("only one path may be provided");
    result.path = argument;
  }
  return result;
}

async function execute(parsed: OpenArguments, deps: ResolvedDependencies): Promise<number> {
  const state = await repositoryState(
    deps.cwd,
    {
      ...(parsed.remote === undefined ? {} : { remote: parsed.remote }),
      ...(parsed.ref === undefined ? {} : { ref: parsed.ref }),
    },
    deps.git,
  );
  const target = repositoryTarget(state.root, parsed.path, deps.cwd);
  if (parsed.lines && target.kind !== ResourceKind.Blob)
    throw new Error("line links require a file path");
  const base = normalizeRemote(state.remote);
  const forge = provider(detectProvider(base, parsed.provider));
  const url = forge.resource(base, {
    ...target,
    ref: state.ref,
    ...(parsed.lines === undefined ? {} : { lines: parsed.lines }),
  });

  if (parsed.action === OpenAction.Print) {
    deps.io.out(url);
    return 0;
  }
  if (parsed.action === OpenAction.Copy) return deps.adapters.copy(url);
  return deps.adapters.open(url);
}

export async function runOpen(
  args: readonly string[],
  input: CommandDependencies = {},
  program = "lemon repo",
): Promise<number> {
  const deps = dependencies(input);
  if (args[0] === CliOption.Help || args[0] === CliOption.HelpShort) {
    deps.io.out(openHelp(program));
    return 0;
  }
  try {
    return await execute(parse(args), deps);
  } catch (error) {
    deps.io.error(`${program}: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}
