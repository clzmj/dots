import { ProcessIO } from "../../../shared/tokens";
import { type Backend, defaultRuntime, Operation, resolveCommand, type Runtime } from "./backend";

export {
  Backend,
  ClipboardCommand,
  ClipboardEnvironment,
  ClipboardSelection,
  Operation,
  XclipOption,
  type Runtime,
} from "./backend";
export { CliAction } from "./process";

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
  const command = resolveCommand(
    Operation.Copy,
    options.backend,
    options.runtime ?? defaultRuntime(),
  );
  const child = Bun.spawn([...command, ...(options.backendArgs ?? [])], {
    stdin: ProcessIO.Pipe,
    stdout: ProcessIO.Inherit,
    stderr: ProcessIO.Inherit,
  });
  child.stdin.write(text);
  child.stdin.end();
  return child.exited;
}
