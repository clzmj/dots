import { ProcessIO } from "../../../shared/tokens";
import { Platform, type ProbeContext } from "./types";

function platformName(value: string): Platform {
  if (value === Platform.Darwin) return Platform.Darwin;
  if (value === Platform.Linux) return Platform.Linux;
  return Platform.Other;
}

export function createProbeContext(overrides: Partial<ProbeContext> = {}): ProbeContext {
  const decoder = new TextDecoder();
  const failures = overrides.failures ?? new Set<string>();
  return {
    platform: platformName(process.platform),
    env: process.env,
    async run(command) {
      try {
        const child = Bun.spawn([...command], {
          stdin: ProcessIO.Ignore,
          stdout: ProcessIO.Pipe,
          stderr: ProcessIO.Pipe,
        });
        const [stdout, stderr, exitCode] = await Promise.all([
          new Response(child.stdout).arrayBuffer(),
          new Response(child.stderr).arrayBuffer(),
          child.exited,
        ]);
        if (exitCode !== 0) failures.add(command.join(" "));
        return {
          stdout: decoder.decode(stdout).trimEnd(),
          stderr: decoder.decode(stderr).trimEnd(),
          exitCode,
        };
      } catch (error) {
        failures.add(command.join(" "));
        return {
          stdout: "",
          stderr: error instanceof Error ? error.message : String(error),
          exitCode: 127,
        };
      }
    },
    hasCommand: (command) => Bun.which(command) !== null,
    async readText(path) {
      const file = Bun.file(path);
      return (await file.exists()) ? file.text() : undefined;
    },
    now: Date.now,
    ...overrides,
    failures,
  };
}

export function clean(value: string | undefined, fallback = ""): string {
  return value?.trim().replace(/\s+/g, " ") || fallback;
}

export function numeric(value: string | undefined, fallback = 0): number {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function valueAfterColon(output: string, label: RegExp): string {
  for (const line of output.split("\n")) {
    const match = line.match(/^\s*([^:]+):\s*(.*)$/);
    if (match && label.test(clean(match[1]))) return clean(match[2]);
  }
  return "";
}
