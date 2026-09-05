import type { CommandRunner, TaskFailure } from "../lib/process";

export type Platform = "darwin" | "debian" | "fedora" | "arch";

export interface Architecture {
  deb: string;
  rpm: string;
  release: string;
  short: string;
}

export interface PackageContext {
  platform: Platform;
  os: "darwin" | "linux";
  arch: Architecture;
  home: string;
  env: Record<string, string>;
  runner: CommandRunner;
  dryRun: boolean;
  exists(test: string): boolean;
  log(message: string): void;
  warn(message: string): void;
  planned: string[];
}

export interface InstallOptions {
  platform?: Platform;
  arch?: Architecture;
  home?: string;
  runner?: CommandRunner;
  dryRun?: boolean;
  exists?: (test: string) => boolean;
  log?: (message: string) => void;
  warn?: (message: string) => void;
  env?: Record<string, string | undefined>;
}

export interface PackageReport {
  planned: string[];
  installed: string[];
  skipped: string[];
  failures: TaskFailure[];
}
