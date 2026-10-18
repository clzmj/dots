import { CliOption } from "../../../../shared/tokens.ts";
import { blameLine, repositoryState } from "../git.ts";
import { provider } from "../providers/index.ts";
import {
  detectProvider,
  normalizeRemote,
  parseProviderName,
  type ProviderName,
} from "../remote.ts";
import { repositoryTarget, ResourceKind } from "../target.ts";
import { dependencies, positiveInteger, type CommandDependencies } from "./shared.ts";

export enum BlameAction {
  Menu = "menu",
  CopyHash = "copy-hash",
  CopyBlame = "copy-blame",
  CopyPermalink = "copy-permalink",
  OpenCommit = "open-commit",
  OpenBranch = "open-branch",
  PrintHash = "print-hash",
  PrintBlame = "print-blame",
  PrintPermalink = "print-permalink",
}

const menuActions = [
  BlameAction.CopyHash,
  BlameAction.CopyBlame,
  BlameAction.CopyPermalink,
  BlameAction.OpenCommit,
  BlameAction.OpenBranch,
];

function parseAction(value: string): BlameAction {
  const action = Object.values(BlameAction).find((candidate) => candidate === value);
  if (action === undefined) throw new Error(`unknown action: ${value}`);
  return action;
}

interface BlameArguments {
  file: string;
  line: number;
  action: BlameAction;
  remote?: string;
  ref?: string;
  provider?: ProviderName;
}

export function blameHelp(program = "lemon repo blame"): string {
  return `Usage:
  ${program} FILE LINE [options]

Options:
  --action ACTION   menu, copy-hash, copy-blame, copy-permalink,
                    open-commit, open-branch, print-hash, print-blame,
                    or print-permalink
  --remote NAME     Select a Git remote
  --ref REF         Select the branch link ref
  --provider NAME   github or gitlab
  --help, -h        Show help`;
}

function parse(args: readonly string[]): BlameArguments {
  const positional: string[] = [];
  let action: BlameAction = BlameAction.Menu;
  let remote: string | undefined;
  let ref: string | undefined;
  let selectedProvider: ProviderName | undefined;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]!;
    if (
      [CliOption.Action, CliOption.Remote, CliOption.Ref, CliOption.Provider].some(
        (option) => option === argument,
      )
    ) {
      const value = args[++index];
      if (!value) throw new Error(`${argument} needs a value`);
      if (argument === CliOption.Action) {
        action = parseAction(value);
      } else if (argument === CliOption.Remote) remote = value;
      else if (argument === CliOption.Ref) ref = value;
      else {
        selectedProvider = parseProviderName(value);
      }
      continue;
    }
    if (argument.startsWith("-")) throw new Error(`unknown option: ${argument}`);
    positional.push(argument);
  }
  if (positional.length !== 2) throw new Error("FILE and LINE are required");
  return {
    file: positional[0]!,
    line: positiveInteger(positional[1]!, "LINE"),
    action,
    ...(remote === undefined ? {} : { remote }),
    ...(ref === undefined ? {} : { ref }),
    ...(selectedProvider === undefined ? {} : { provider: selectedProvider }),
  };
}

export async function runBlame(
  args: readonly string[],
  input: CommandDependencies = {},
  program = "lemon repo blame",
): Promise<number> {
  const deps = dependencies(input);
  if (args.length === 0 || args[0] === CliOption.Help || args[0] === CliOption.HelpShort) {
    deps.io.out(blameHelp(program));
    return 0;
  }
  try {
    const parsed = parse(args);
    const state = await repositoryState(
      deps.cwd,
      {
        ...(parsed.remote === undefined ? {} : { remote: parsed.remote }),
        ...(parsed.ref === undefined ? {} : { ref: parsed.ref }),
      },
      deps.git,
    );
    const target = repositoryTarget(state.root, parsed.file, deps.cwd);
    if (target.kind !== ResourceKind.Blob) throw new Error("FILE must be a regular file");
    const blamed = await blameLine(state.root, target.path, parsed.line, deps.git);
    const base = normalizeRemote(state.remote);
    const forge = provider(detectProvider(base, parsed.provider));
    const permalink = forge.resource(base, {
      kind: ResourceKind.Blob,
      ref: blamed.sha,
      path: target.path,
      lines: { start: parsed.line },
    });
    const branchLink = forge.resource(base, {
      kind: ResourceKind.Blob,
      ref: state.ref,
      path: target.path,
      lines: { start: parsed.line },
    });
    const commit = forge.commit(base, blamed.sha);

    let action = parsed.action;
    if (action === BlameAction.Menu) {
      const choice = await deps.adapters.choose(menuActions, `blame:${parsed.line} > `);
      if (!choice) return 0;
      const selected = menuActions.find((candidate) => candidate === choice);
      if (selected === undefined) throw new Error(`unknown menu action: ${choice}`);
      action = selected;
    }

    if (action === BlameAction.CopyHash) return deps.adapters.copy(blamed.sha);
    if (action === BlameAction.CopyBlame) return deps.adapters.copy(blamed.text);
    if (action === BlameAction.CopyPermalink) return deps.adapters.copy(permalink);
    if (action === BlameAction.OpenCommit) return deps.adapters.open(commit);
    if (action === BlameAction.OpenBranch) return deps.adapters.open(branchLink);
    if (action === BlameAction.PrintHash) deps.io.out(blamed.sha);
    else if (action === BlameAction.PrintBlame) deps.io.out(blamed.text);
    else deps.io.out(permalink);
    return 0;
  } catch (error) {
    deps.io.error(`${program}: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}
