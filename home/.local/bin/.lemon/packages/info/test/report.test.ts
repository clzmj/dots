import {
  DiskOption,
  HostnameOption,
  IPArgument,
  InfoEnvironment,
  LastlogOption,
  NprocOption,
  SwVersOption,
  SysctlKey,
  SysctlOption,
  SystemCommand,
  SystemPath,
  UnameOption,
  UptimeOption,
  WhoArgument,
} from "../src/tokens";
import { CliOption, Executable, ProcessIO } from "../../../shared/tokens";
import { describe, expect, test } from "bun:test";

import { parseArgs } from "../src/cli";
import { collectMachineReport } from "../src/collectors";
import { collectCPU } from "../src/collectors/cpu";
import { collectMemory } from "../src/collectors/memory";
import { collectOS } from "../src/collectors/os";
import { createProbeContext } from "../src/context";
import { renderJSON } from "../src/renderers/json";
import { barGraph, renderTable } from "../src/renderers/table";
import {
  CliAction,
  OutputFormat,
  Platform,
  type CommandResult,
  type MachineReport,
  type ProbeContext,
} from "../src/types";

const key = (command: readonly string[]) => command.join("\0");

function fixture(
  options: {
    platform?: Platform;
    commands?: Record<string, string | CommandResult>;
    files?: Record<string, string>;
    available?: string[];
    env?: Record<string, string>;
    now?: number;
  } = {},
): ProbeContext {
  const commands = options.commands ?? {};
  return {
    platform: options.platform ?? Platform.Linux,
    env: { [InfoEnvironment.User]: "fixture", ...options.env },
    failures: new Set(),
    hasCommand: (command) => (options.available ?? []).includes(command),
    readText: async (path) => options.files?.[path],
    now: () => options.now ?? 0,
    async run(command) {
      const value = commands[key(command)];
      if (typeof value === "string") return { stdout: value, stderr: "", exitCode: 0 };
      return value ?? { stdout: "", stderr: "not found", exitCode: 127 };
    },
  };
}

const linuxCommands: Record<string, string> = {
  [key([SystemCommand.Whoami])]: "ada",
  [key([SystemCommand.Hostname, HostnameOption.Short])]: "lab",
  [key([SystemCommand.Hostname, HostnameOption.FullyQualified])]: "lab.example.test",
  [key([SystemCommand.Who, WhoArgument.Am, WhoArgument.I])]: "ada pts/1 (203.0.113.8)",
  [key([SystemCommand.IP, IPArgument.Oneline, IPArgument.Address, IPArgument.Show])]:
    "1: lo inet 127.0.0.1/8\n2: eth0 inet 192.0.2.42/24",
  [key([SystemCommand.Uname])]: "Linux",
  [key([SystemCommand.Uname, UnameOption.Release])]: "6.12.1-test",
  [key([SystemCommand.Lscpu])]:
    "Model name: Fixture 9000\nCore(s) per socket: 4\nSocket(s): 2\nHypervisor vendor: KVM",
  [key([SystemCommand.Nproc, NprocOption.All])]: "8",
  [key([SystemCommand.Uptime])]: "load average: 1.50, 0.75, 0.25",
  [key([SystemCommand.DiskFree, DiskOption.Megabytes, SystemPath.Root])]:
    "Filesystem 1M-blocks Used Available Capacity Mounted on\n/dev/root 102400 25600 76800 25% /",
  [key([SystemCommand.Lastlog, LastlogOption.User, "fixture"])]:
    "Username Port From Latest\nfixture pts/1 198.51.100.7 Tue Aug 25 10:30:00 +0000 2026",
  [key([SystemCommand.Uptime, UptimeOption.Pretty])]: "up 4 days, 2 hours, 3 minutes",
};

const linuxFiles = {
  [SystemPath.OSRelease]: 'ID=ubuntu\nVERSION_ID="26.04"\nVERSION_CODENAME=quokka\n',
  [SystemPath.ResolvConf]: "nameserver 1.1.1.1\nnameserver 1.1.1.1\nnameserver 2001:db8::53\n",
  [SystemPath.CPUInfo]: "processor : 0\nmodel name : Fixture 9000\ncpu MHz : 3200.000",
  [SystemPath.MemInfo]: "MemTotal: 16777216 kB\nMemAvailable: 12582912 kB\n",
};

test("collects a deterministic Linux report and honors an explicit title", async () => {
  const context = fixture({
    commands: linuxCommands,
    files: linuxFiles,
    available: [
      SystemCommand.Hostname,
      SystemCommand.IP,
      SystemCommand.Lscpu,
      SystemCommand.Nproc,
      SystemCommand.Lastlog,
    ],
  });
  const report = await collectMachineReport(context, { title: "Fixture" });
  expect(report.title).toBe("Fixture");
  expect(report.os).toEqual({ name: "Ubuntu 26.04 Quokka", kernel: "Linux 6.12.1-test" });
  expect(report.network.machineIP).toBe("192.0.2.42");
  expect(report.network.dnsIPs).toEqual(["1.1.1.1", "2001:db8::53"]);
  expect(report.cpu).toMatchObject({ cores: 8, coresPerSocket: 4, sockets: 2, frequencyGHz: 3.2 });
  expect(report.memory).toEqual({ totalKiB: 16_777_216, usedKiB: 4_194_304 });
  expect(report.disk).toEqual({ totalMiB: 102_400, usedMiB: 25_600 });
});

describe("Darwin collectors", () => {
  test("parse mocked OS, CPU, and memory probes", async () => {
    const commands: Record<string, string> = {
      [key([SystemCommand.SwVers, SwVersOption.ProductName])]: "macOS",
      [key([SystemCommand.SwVers, SwVersOption.ProductVersion])]: "26.0",
      [key([SystemCommand.SwVers, SwVersOption.BuildVersion])]: "25A123",
      [key([SystemCommand.Uname])]: "Darwin",
      [key([SystemCommand.Uname, UnameOption.Release])]: "25.0.0",
      [key([SystemCommand.Sysctl, SysctlOption.Name, SysctlKey.CPUBrand])]: "",
      [key([SystemCommand.Sysctl, SysctlOption.Name, SysctlKey.HardwareModel])]: "Mac16,1",
      [key([SystemCommand.Sysctl, SysctlOption.Name, SysctlKey.CPUCount])]: "10",
      [key([SystemCommand.Sysctl, SysctlOption.Name, SysctlKey.PhysicalCPUCount])]: "10",
      [key([SystemCommand.Sysctl, SysctlOption.Name, SysctlKey.CPUFrequency])]: "",
      [key([SystemCommand.Sysctl, SysctlOption.Name, SysctlKey.Virtualized])]: "0",
      [key([SystemCommand.Uptime])]: "load averages: 0.10 0.20 0.30",
      [key([SystemCommand.Sysctl, SysctlOption.Name, SysctlKey.MemorySize])]: "17179869184",
      [key([SystemCommand.Sysctl, SysctlOption.Name, SysctlKey.PageSize])]: "16384",
      [key([SystemCommand.VmStat])]:
        "Pages free: 1000.\nPages inactive: 2000.\nPages speculative: 100.",
    };
    const context = fixture({ platform: Platform.Darwin, commands });
    const [os, cpu, memory] = await Promise.all([
      collectOS(context),
      collectCPU(context),
      collectMemory(context),
    ]);
    expect(os.name).toBe("macOS 26.0 25A123");
    expect(cpu).toMatchObject({ model: "Mac16,1", cores: 10, loadAverage: [0.1, 0.2, 0.3] });
    expect(memory.totalKiB).toBe(16_777_216);
  });
});

test("renders stable JSON and aligned Unicode tables", () => {
  const report: MachineReport = {
    title: "Lab 🧪",
    os: { name: "Linux", kernel: "Linux 6" },
    network: {
      hostname: "lab",
      machineIP: "192.0.2.1",
      clientIP: "Not connected",
      dnsIPs: ["1.1.1.1"],
      currentUser: "测试者",
    },
    cpu: {
      model: "Example CPU",
      cores: 4,
      coresPerSocket: 4,
      sockets: 1,
      hypervisor: "Bare Metal",
      loadAverage: [1, 2, 3],
    },
    memory: { usedKiB: 1, totalKiB: 4 },
    disk: { usedMiB: 1, totalMiB: 4 },
    login: { lastLogin: "Never", uptime: "1h" },
  };
  expect(JSON.parse(renderJSON(report))).toEqual(report);
  const widths = renderTable(report)
    .trimEnd()
    .split("\n")
    .map((line) => Bun.stringWidth(line));
  expect(new Set(widths).size).toBe(1);
  expect(barGraph(1, 4, 8)).toBe("██░░░░░░");
});

test("parses CLI features and rejects invalid input", () => {
  expect(parseArgs([CliOption.Json, CliOption.Strict, CliOption.Title, "Worker"])).toEqual({
    action: CliAction.Run,
    format: OutputFormat.JSON,
    strict: true,
    title: "Worker",
  });
  expect(() => parseArgs(["unknown"])).toThrow("unknown option");
  expect(() => parseArgs([CliOption.Title])).toThrow("requires a value");
});

test("help and version succeed while an invalid command fails", async () => {
  for (const option of [CliOption.Help, CliOption.Version]) {
    const child = Bun.spawn([Executable.Bun, "src/cli.ts", option], {
      cwd: import.meta.dir + "/..",
    });
    expect(await child.exited).toBe(0);
  }
  const child = Bun.spawn([Executable.Bun, "src/cli.ts", "invalid"], {
    cwd: import.meta.dir + "/..",
    stderr: ProcessIO.Pipe,
  });
  expect(await child.exited).toBe(2);
});

test("the default context records failed probes for strict mode", async () => {
  const context = createProbeContext();
  await context.run(["lemonaid-machine-report-command-that-does-not-exist"]);
  expect(context.failures.size).toBe(1);
});
