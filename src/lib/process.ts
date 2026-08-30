export type Command = readonly [string, ...string[]];

export interface RunOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  stdinText?: string;
  timeoutMs?: number;
}

export interface CommandResult {
  command: Command;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface CommandRunner {
  run(command: Command, options?: RunOptions): Promise<CommandResult>;
}

export class CommandError extends Error {
  constructor(public readonly result: CommandResult) {
    const detail = result.stderr.trim() || result.stdout.trim();
    super(
      `${formatCommand(result.command)} exited ${result.exitCode}${
        detail ? `: ${detail.split("\n").at(-1)}` : ""
      }`,
    );
    this.name = "CommandError";
  }
}

export function formatCommand(command: Command): string {
  return command
    .map((part) => (/^[A-Za-z0-9_./:@%+=,-]+$/.test(part) ? part : JSON.stringify(part)))
    .join(" ");
}

export class BunCommandRunner implements CommandRunner {
  async run(command: Command, options: RunOptions = {}): Promise<CommandResult> {
    const started = performance.now();
    const subprocess = Bun.spawn(command, {
      cwd: options.cwd,
      env: mergeEnv(options.env),
      // A fresh process group lets a timeout terminate grandchildren holding
      // stdout/stderr pipes open (installers frequently spawn helpers).
      detached: process.platform !== "win32",
      stdin: options.stdinText === undefined ? "inherit" : "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    if (options.stdinText !== undefined && subprocess.stdin !== undefined) {
      subprocess.stdin.write(options.stdinText);
      subprocess.stdin.end();
    }

    let settled = false;
    let forceTimer: ReturnType<typeof setTimeout> | undefined;
    const timeoutTimer = options.timeoutMs
      ? setTimeout(() => {
          if (settled) return;
          killProcessGroup(subprocess.pid, "SIGTERM", () => subprocess.kill("SIGTERM"));
          forceTimer = setTimeout(() => {
            if (!settled)
              killProcessGroup(subprocess.pid, "SIGKILL", () => subprocess.kill("SIGKILL"));
          }, 1_000);
        }, options.timeoutMs)
      : undefined;

    const [exitCode, stdout, stderr] = await Promise.all([
      subprocess.exited,
      new Response(subprocess.stdout).text(),
      new Response(subprocess.stderr).text(),
    ]);
    settled = true;
    if (timeoutTimer) clearTimeout(timeoutTimer);
    if (forceTimer) clearTimeout(forceTimer);

    return {
      command,
      exitCode,
      stdout,
      stderr,
      durationMs: performance.now() - started,
    };
  }
}

function killProcessGroup(pid: number, signal: NodeJS.Signals, fallback: () => void): void {
  if (process.platform !== "win32") {
    try {
      process.kill(-pid, signal);
      return;
    } catch {}
  }
  try {
    fallback();
  } catch {}
}

function mergeEnv(
  overrides: Record<string, string | undefined> | undefined,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }
  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  return env;
}

export async function runChecked(
  runner: CommandRunner,
  command: Command,
  options?: RunOptions,
): Promise<CommandResult> {
  const result = await runner.run(command, options);
  if (result.exitCode !== 0) throw new CommandError(result);
  return result;
}

export interface Task {
  name: string;
  run(): Promise<void>;
}

export interface TaskFailure {
  name: string;
  error: unknown;
}

export interface TaskSummary {
  completed: string[];
  failed: TaskFailure[];
}

/** Run tasks one at a time. Use this for package managers and shared state. */
export async function runSerial(tasks: readonly Task[]): Promise<TaskSummary> {
  const summary: TaskSummary = { completed: [], failed: [] };
  for (const task of tasks) {
    try {
      await task.run();
      summary.completed.push(task.name);
    } catch (error) {
      summary.failed.push({ name: task.name, error });
    }
  }
  return summary;
}

/** Run independent tasks together and retain every failure rather than failing fast. */
export async function runParallel(tasks: readonly Task[]): Promise<TaskSummary> {
  const settled = await Promise.allSettled(tasks.map((task) => task.run()));
  const summary: TaskSummary = { completed: [], failed: [] };
  settled.forEach((result, index) => {
    const task = tasks[index];
    if (!task) return;
    const name = task.name;
    if (result.status === "fulfilled") summary.completed.push(name);
    else summary.failed.push({ name, error: result.reason });
  });
  return summary;
}
