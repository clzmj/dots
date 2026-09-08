import { basename } from "node:path";

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type ProcessSignal = 0 | "SIGTERM" | "SIGKILL";

export interface SystemAdapter {
  which(command: string): string | null;
  run(command: readonly string[]): Promise<CommandResult>;
  signal(pid: number, signal: ProcessSignal): boolean;
  sleep(milliseconds: number): Promise<void>;
  now(): number;
}

export interface Server {
  pid: number;
  name: string;
  ports: number[];
  command: string;
}

export interface StopFailure {
  pid: number;
  error: string;
}

export interface StopResult {
  terminated: number[];
  killed: number[];
  stale: number[];
  failed: StopFailure[];
}

export interface StopOptions {
  timeoutMs?: number;
  killAfterTimeout?: boolean;
}

interface ParsedProcess {
  pid: number;
  name: string;
  ports: Set<number>;
}

const DEV_NAMES = new Set([
  "node",
  "python",
  "python3",
  "uv",
  "go",
  "java",
  "npm",
  "yarn",
  "pnpm",
  "bun",
  "deno",
  "cargo",
  "ruby",
  "php",
  "artisan",
  "uvicorn",
  "gunicorn",
  "dotnet",
]);

const DEV_PATTERNS = [
  "go run",
  "npm run",
  "yarn start",
  "pnpm run",
  "bun run",
  "uv run",
  "php artisan serve",
  "http.server",
  "uvicorn",
  "gunicorn",
] as const;

export const defaultSystem: SystemAdapter = {
  which: (command) => Bun.which(command),
  async run(command) {
    const child = Bun.spawn([...command], { stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { exitCode, stdout, stderr };
  },
  signal(pid, signal) {
    try {
      process.kill(pid, signal);
      return true;
    } catch (error) {
      if (isErrno(error, "ESRCH")) return false;
      throw error;
    }
  },
  sleep: (milliseconds) => Bun.sleep(milliseconds),
  now: () => performance.now(),
};

export function parseLsof(output: string): Array<Omit<Server, "command">> {
  const byPid = new Map<number, ParsedProcess>();
  let current: ParsedProcess | undefined;

  for (const raw of output.split("\n")) {
    if (!raw) continue;
    const field = raw[0];
    const value = raw.slice(1);
    if (field === "p") {
      const pid = Number(value);
      if (!Number.isSafeInteger(pid) || pid <= 0) {
        current = undefined;
        continue;
      }
      current = byPid.get(pid) ?? { pid, name: "", ports: new Set<number>() };
      byPid.set(pid, current);
      continue;
    }
    if (!current) continue;
    if (field === "c") {
      current.name = value;
      continue;
    }
    if (field === "n") {
      const match = value.match(/:(\d+)(?:\s|$|\(LISTEN\))/);
      const port = match?.[1] === undefined ? Number.NaN : Number(match[1]);
      if (Number.isInteger(port) && port >= 1 && port <= 65_535) current.ports.add(port);
    }
  }

  return [...byPid.values()].map(({ pid, name, ports }) => ({
    pid,
    name,
    ports: [...ports].toSorted((left, right) => left - right),
  }));
}

export function isDevelopmentServer(name: string, command: string): boolean {
  const processName = basename(name).toLowerCase();
  const lowerCommand = command.toLowerCase();
  const nameMatches =
    DEV_NAMES.has(processName) ||
    [...DEV_NAMES].some(
      (candidate) =>
        processName.startsWith(`${candidate}-`) || processName.startsWith(`${candidate}.`),
    );
  return nameMatches || DEV_PATTERNS.some((pattern) => lowerCommand.includes(pattern));
}

export function parseSelection(value: string, count: number): number[] {
  const input = value.trim().toLowerCase();
  if (input === "all" || input === "a") {
    return Array.from({ length: count }, (_, index) => index);
  }
  if (!input) throw new Error("empty selection");

  const selected = new Set<number>();
  for (const token of input.split(/[\s,]+/)) {
    const range = token.match(/^(\d+)-(\d+)$/);
    if (range?.[1] !== undefined && range[2] !== undefined) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (start > end) throw new Error(`invalid range: ${token}`);
      for (let number = start; number <= end; number += 1) selected.add(number - 1);
    } else if (/^\d+$/.test(token)) {
      selected.add(Number(token) - 1);
    } else {
      throw new Error(`invalid selection: ${token}`);
    }
  }

  if ([...selected].some((index) => index < 0 || index >= count)) {
    throw new Error("selection is out of range");
  }
  return [...selected].toSorted((left, right) => left - right);
}

export async function discoverServers(
  system: SystemAdapter = defaultSystem,
  includeAll = false,
): Promise<Server[]> {
  if (system.which("lsof") === null) {
    throw new Error("lsof is required (brew install lsof / apt install lsof)");
  }

  const result = await system.run(["lsof", "-nP", "-iTCP", "-sTCP:LISTEN", "-Fpcn"]);
  if (result.exitCode !== 0) {
    // lsof commonly returns 1 when a selection has no matches. An empty result
    // with no diagnostic is therefore a valid "nothing is listening" result.
    if (result.stdout.trim() === "" && result.stderr.trim() === "") return [];
    const detail = result.stderr.trim();
    throw new Error(`lsof failed with status ${result.exitCode}${detail ? `: ${detail}` : ""}`);
  }

  const inspected = await Promise.all(
    parseLsof(result.stdout).map(async (listener): Promise<Server | undefined> => {
      if (listener.ports.length === 0) return undefined;
      const processResult = await system.run(["ps", "-p", String(listener.pid), "-o", "command="]);
      if (processResult.exitCode !== 0) return undefined;
      return { ...listener, command: processResult.stdout.trim() };
    }),
  );

  return inspected
    .filter((server): server is Server => server !== undefined)
    .filter((server) => includeAll || isDevelopmentServer(server.name, server.command))
    .toSorted(
      (left, right) =>
        (left.ports[0] ?? Number.MAX_SAFE_INTEGER) - (right.ports[0] ?? Number.MAX_SAFE_INTEGER) ||
        left.pid - right.pid,
    );
}

export async function stopServers(
  targets: readonly Server[],
  system: SystemAdapter = defaultSystem,
  options: StopOptions = {},
): Promise<StopResult> {
  const timeoutMs = options.timeoutMs ?? 3_000;
  const killAfterTimeout = options.killAfterTimeout ?? true;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) throw new Error("timeout must be non-negative");

  const unique = new Map<number, Server>();
  for (const target of targets) {
    assertSafePid(target.pid);
    unique.set(target.pid, target);
  }

  const result: StopResult = { terminated: [], killed: [], stale: [], failed: [] };
  const current = new Map(
    (await discoverServers(system, true)).map((server) => [server.pid, server]),
  );
  const signaled: Server[] = [];

  for (const target of unique.values()) {
    const fresh = current.get(target.pid);
    if (!fresh || !sameServer(target, fresh)) {
      result.stale.push(target.pid);
      continue;
    }
    try {
      if (!system.signal(target.pid, "SIGTERM")) result.stale.push(target.pid);
      else signaled.push(target);
    } catch (error) {
      result.failed.push({ pid: target.pid, error: errorMessage(error) });
    }
  }

  const termStates = await Promise.all(
    signaled.map(async (target) => ({
      target,
      exited: await waitForExit(target.pid, timeoutMs, system),
    })),
  );
  const survivors: Server[] = [];
  for (const state of termStates) {
    if (state.exited) result.terminated.push(state.target.pid);
    else survivors.push(state.target);
  }

  if (!killAfterTimeout) {
    for (const target of survivors) {
      result.failed.push({ pid: target.pid, error: "still running after SIGTERM timeout" });
    }
    return sortedResult(result);
  }

  await Promise.all(
    survivors.map(async (target) => {
      try {
        if (!system.signal(target.pid, "SIGKILL")) {
          result.terminated.push(target.pid);
          return;
        }
        if (await waitForExit(target.pid, Math.min(timeoutMs, 1_000), system)) {
          result.killed.push(target.pid);
        } else {
          result.failed.push({ pid: target.pid, error: "still running after SIGKILL" });
        }
      } catch (error) {
        result.failed.push({ pid: target.pid, error: errorMessage(error) });
      }
    }),
  );

  return sortedResult(result);
}

export function formatServerTable(servers: readonly Server[], verbose = false): string {
  const rows = servers.map((server, index) => {
    const command = server.command || server.name;
    return [
      String(index + 1).padStart(3),
      String(server.pid).padEnd(9),
      fit(server.ports.join(","), 16),
      verbose ? command : fit(command, 60).trimEnd(),
    ].join(" ");
  });
  return ["  #   PID       Port(s)          Command", ...rows.map((row) => `  ${row}`)].join("\n");
}

function fit(value: string, width: number): string {
  const displayWidth = Bun.stringWidth(value);
  if (displayWidth <= width) return `${value}${" ".repeat(width - displayWidth)}`;
  return `${Bun.sliceAnsi(value, 0, width - 1)}…`;
}

function sameServer(expected: Server, actual: Server): boolean {
  return (
    expected.name === actual.name &&
    expected.command === actual.command &&
    expected.ports.length === actual.ports.length &&
    expected.ports.every((port, index) => port === actual.ports[index])
  );
}

function assertSafePid(pid: number): void {
  if (!Number.isSafeInteger(pid) || pid <= 1 || pid === process.pid || pid === process.ppid) {
    throw new Error(`refusing unsafe PID ${pid}`);
  }
}

async function waitForExit(
  pid: number,
  timeoutMs: number,
  system: SystemAdapter,
): Promise<boolean> {
  const deadline = system.now() + timeoutMs;
  while (system.now() < deadline) {
    if (!system.signal(pid, 0)) return true;
    await system.sleep(Math.min(100, Math.max(0, deadline - system.now())));
  }
  return !system.signal(pid, 0);
}

function sortedResult(result: StopResult): StopResult {
  result.terminated.sort((left, right) => left - right);
  result.killed.sort((left, right) => left - right);
  result.stale.sort((left, right) => left - right);
  result.failed.sort((left, right) => left.pid - right.pid);
  return result;
}

function isErrno(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
