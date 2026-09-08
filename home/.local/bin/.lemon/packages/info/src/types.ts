export type Platform = "darwin" | "linux" | "other";

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ProbeContext {
  platform: Platform;
  env: Readonly<Record<string, string | undefined>>;
  failures: Set<string>;
  run(command: readonly string[]): Promise<CommandResult>;
  hasCommand(command: string): boolean;
  readText(path: string): Promise<string | undefined>;
  now(): number;
}

export interface MachineReport {
  title: string;
  os: { name: string; kernel: string };
  network: {
    hostname: string;
    machineIP: string;
    clientIP: string;
    dnsIPs: string[];
    currentUser: string;
  };
  cpu: {
    model: string;
    cores: number;
    coresPerSocket: number;
    sockets: number;
    hypervisor: string;
    frequencyGHz?: number;
    loadAverage: [number, number, number];
  };
  memory: { usedKiB: number; totalKiB: number };
  disk: { usedMiB: number; totalMiB: number };
  login: { lastLogin: string; lastLoginIP?: string; uptime: string };
}
