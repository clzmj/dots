import { FzfOption } from "./tokens.ts";
import { ProcessIO, Executable } from "../../../shared/tokens.ts";
export interface ActionAdapters {
  readonly open: (target: string) => Promise<number>;
  readonly copy: (text: string) => Promise<number>;
  readonly choose: (choices: readonly string[], prompt: string) => Promise<string | undefined>;
}

async function open(target: string): Promise<number> {
  return openTargets([target]);
}

async function copy(text: string): Promise<number> {
  return copyText(text);
}

async function choose(choices: readonly string[], prompt: string): Promise<string | undefined> {
  const child = Bun.spawn(
    [Executable.Fzf, `${FzfOption.Prompt}=${prompt}`, `${FzfOption.Height}=40%`, FzfOption.Border],
    {
      stdin: ProcessIO.Pipe,
      stdout: ProcessIO.Pipe,
      stderr: ProcessIO.Inherit,
    },
  );
  child.stdin.write(`${choices.join("\n")}\n`);
  child.stdin.end();
  const output = (await new Response(child.stdout).text()).trim();
  return (await child.exited) === 0 ? output : undefined;
}

export const defaultAdapters: ActionAdapters = { open, copy, choose };
import { copyText } from "../../clip/src";
import { openTargets } from "../../open/src";
