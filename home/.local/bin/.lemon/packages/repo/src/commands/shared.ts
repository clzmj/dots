import type { ActionAdapters } from "../adapters.ts";
import { defaultAdapters } from "../adapters.ts";
import type { GitRunner } from "../git.ts";
import { runGit } from "../git.ts";

export interface CommandIO {
  readonly out: (message: string) => void;
  readonly error: (message: string) => void;
}

export interface CommandDependencies {
  readonly cwd?: string;
  readonly git?: GitRunner;
  readonly adapters?: ActionAdapters;
  readonly io?: CommandIO;
}

export interface ResolvedDependencies {
  readonly cwd: string;
  readonly git: GitRunner;
  readonly adapters: ActionAdapters;
  readonly io: CommandIO;
}

export function dependencies(input: CommandDependencies = {}): ResolvedDependencies {
  return {
    cwd: input.cwd ?? process.cwd(),
    git: input.git ?? runGit,
    adapters: input.adapters ?? defaultAdapters,
    io: input.io ?? { out: console.log, error: console.error },
  };
}

export function positiveInteger(value: string, option: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1)
    throw new Error(`${option} needs a positive integer`);
  return number;
}
