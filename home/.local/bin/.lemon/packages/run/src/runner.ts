import { open } from "node:fs/promises";

export type NotificationCondition = "always" | "success" | "failure";

export interface NotifyOptions {
  condition?: NotificationCondition;
  afterMs?: number;
  title?: string;
}

export interface CommandRuntime {
  spawn(command: readonly string[]): Promise<number>;
  now(): number;
}

export type Notifier = (title: string, message: string) => Promise<boolean>;

export interface RunResult {
  status: number;
  durationMs: number;
  notified: boolean;
  error: string | null;
}

export const defaultRuntime: CommandRuntime = {
  async spawn(command) {
    const child = Bun.spawn([...command], {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });
    return child.exited;
  },
  now: () => performance.now(),
};

export function formatDuration(milliseconds: number): string {
  const duration = Math.max(0, Math.floor(milliseconds / 1_000));
  const hours = Math.floor(duration / 3_600);
  const minutes = Math.floor((duration % 3_600) / 60);
  const seconds = duration % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function osc777(title: string, message: string): string {
  return `\u001b]777;notify;${sanitizeField(title)};${sanitizeField(message)}\u0007`;
}

export async function terminalNotifier(title: string, message: string): Promise<boolean> {
  const sequence = osc777(title, message);
  try {
    const terminal = await open("/dev/tty", "w");
    try {
      await terminal.write(sequence);
    } finally {
      await terminal.close();
    }
    return true;
  } catch {
    if (!process.stderr.isTTY) return false;
    process.stderr.write(sequence);
    return true;
  }
}

export async function runAndNotify(
  command: readonly string[],
  options: NotifyOptions = {},
  runtime: CommandRuntime = defaultRuntime,
  notify: Notifier = terminalNotifier,
): Promise<RunResult> {
  if (command.length === 0) throw new Error("a command is required");
  const condition = options.condition ?? "always";
  const afterMs = options.afterMs ?? 0;
  if (!Number.isFinite(afterMs) || afterMs < 0) throw new Error("after must be non-negative");

  const started = runtime.now();
  let status = 127;
  let error: string | null = null;
  try {
    status = await runtime.spawn(command);
  } catch (cause) {
    error = errorMessage(cause);
  }
  const durationMs = Math.max(0, runtime.now() - started);

  const matchesCondition =
    condition === "always" ||
    (condition === "success" && status === 0) ||
    (condition === "failure" && status !== 0);
  let notified = false;
  if (matchesCondition && durationMs >= afterMs) {
    const title = options.title ?? commandName(command[0] ?? "command");
    const message =
      status === 0
        ? `✅ Succeeded after ${formatDuration(durationMs)}`
        : `❌ Failed (status: ${status}) after ${formatDuration(durationMs)}`;
    notified = await notify(title, message);
  }

  return { status, durationMs, notified, error };
}

function commandName(command: string): string {
  const normalized = command.replaceAll("\\", "/");
  return normalized.split("/").at(-1) || command;
}

function sanitizeField(value: string): string {
  // oxlint-disable-next-line eslint/no-control-regex -- Intentionally strips terminal control bytes.
  return value.replace(/[;\u0000-\u001f\u007f-\u009f]/g, " ").trim();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
