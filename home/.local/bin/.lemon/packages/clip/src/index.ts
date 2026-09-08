import { type Backend, defaultRuntime, resolveCommand, type Runtime } from "./backend";

export type { Backend, Operation, Runtime } from "./backend";

export interface CopyTextOptions {
  backend?: Backend;
  backendArgs?: readonly string[];
  runtime?: Runtime;
}

/** Copy text using the same backend selection as the clip command. */
export async function copyText(
  text: string | Uint8Array,
  options: CopyTextOptions = {},
): Promise<number> {
  const command = resolveCommand("copy", options.backend, options.runtime ?? defaultRuntime());
  const child = Bun.spawn([...command, ...(options.backendArgs ?? [])], {
    stdin: "pipe",
    stdout: "inherit",
    stderr: "inherit",
  });
  child.stdin.write(text);
  child.stdin.end();
  return child.exited;
}
