import { blameLine, repositoryState } from "../git.ts";
import { provider } from "../providers/index.ts";
import { detectProvider, normalizeRemote, type ProviderName } from "../remote.ts";
import { repositoryTarget } from "../target.ts";
import { dependencies, positiveInteger, type CommandDependencies } from "./shared.ts";

const actions = [
  "menu",
  "copy-hash",
  "copy-blame",
  "copy-permalink",
  "open-commit",
  "open-branch",
  "print-hash",
  "print-blame",
  "print-permalink",
] as const;
type BlameAction = (typeof actions)[number];

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
  let action: BlameAction = "menu";
  let remote: string | undefined;
  let ref: string | undefined;
  let selectedProvider: ProviderName | undefined;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]!;
    if (["--action", "--remote", "--ref", "--provider"].includes(argument)) {
      const value = args[++index];
      if (!value) throw new Error(`${argument} needs a value`);
      if (argument === "--action") {
        if (!actions.includes(value as BlameAction)) throw new Error(`unknown action: ${value}`);
        action = value as BlameAction;
      } else if (argument === "--remote") remote = value;
      else if (argument === "--ref") ref = value;
      else {
        if (value !== "github" && value !== "gitlab")
          throw new Error("--provider must be github or gitlab");
        selectedProvider = value;
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
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
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
    if (target.kind !== "blob") throw new Error("FILE must be a regular file");
    const blamed = await blameLine(state.root, target.path, parsed.line, deps.git);
    const base = normalizeRemote(state.remote);
    const forge = provider(detectProvider(base, parsed.provider));
    const permalink = forge.resource(base, {
      kind: "blob",
      ref: blamed.sha,
      path: target.path,
      lines: { start: parsed.line },
    });
    const branchLink = forge.resource(base, {
      kind: "blob",
      ref: state.ref,
      path: target.path,
      lines: { start: parsed.line },
    });
    const commit = forge.commit(base, blamed.sha);

    let action = parsed.action;
    if (action === "menu") {
      const choice = await deps.adapters.choose(
        ["copy-hash", "copy-blame", "copy-permalink", "open-commit", "open-branch"],
        `blame:${parsed.line} > `,
      );
      if (!choice) return 0;
      action = choice as BlameAction;
    }

    if (action === "copy-hash") return deps.adapters.copy(blamed.sha);
    if (action === "copy-blame") return deps.adapters.copy(blamed.text);
    if (action === "copy-permalink") return deps.adapters.copy(permalink);
    if (action === "open-commit") return deps.adapters.open(commit);
    if (action === "open-branch") return deps.adapters.open(branchLink);
    if (action === "print-hash") deps.io.out(blamed.sha);
    else if (action === "print-blame") deps.io.out(blamed.text);
    else deps.io.out(permalink);
    return 0;
  } catch (error) {
    deps.io.error(`${program}: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}
