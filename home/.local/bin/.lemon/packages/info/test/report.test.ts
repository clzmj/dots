import { describe, expect, test } from "bun:test";

import { parseArgs } from "../src/cli";
import { collectMachineReport } from "../src/collectors";
import { collectCPU } from "../src/collectors/cpu";
import { collectMemory } from "../src/collectors/memory";
import { collectOS } from "../src/collectors/os";
import { createProbeContext } from "../src/context";
import { renderJSON } from "../src/renderers/json";
import { barGraph, renderTable } from "../src/renderers/table";
import type { CommandResult, MachineReport, Platform, ProbeContext } from "../src/types";

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
    platform: options.platform ?? "linux",
    env: { USER: "fixture", ...options.env },
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
  [key(["whoami"])]: "ada",
  [key(["hostname", "-s"])]: "lab",
  [key(["hostname", "-f"])]: "lab.example.test",
  [key(["who", "am", "i"])]: "ada pts/1 (203.0.113.8)",
  [key(["ip", "-o", "addr", "show"])]: "1: lo inet 127.0.0.1/8\n2: eth0 inet 192.0.2.42/24",
  [key(["uname"])]: "Linux",
  [key(["uname", "-r"])]: "6.12.1-test",
  [key(["lscpu"])]:
    "Model name: Fixture 9000\nCore(s) per socket: 4\nSocket(s): 2\nHypervisor vendor: KVM",
  [key(["nproc", "--all"])]: "8",
  [key(["uptime"])]: "load average: 1.50, 0.75, 0.25",
  [key(["df", "-Pm", "/"])]:
    "Filesystem 1M-blocks Used Available Capacity Mounted on\n/dev/root 102400 25600 76800 25% /",
  [key(["lastlog", "-u", "fixture"])]:
    "Username Port From Latest\nfixture pts/1 198.51.100.7 Tue Aug 25 10:30:00 +0000 2026",
  [key(["uptime", "-p"])]: "up 4 days, 2 hours, 3 minutes",
};

const linuxFiles = {
  "/etc/os-release": 'ID=ubuntu\nVERSION_ID="26.04"\nVERSION_CODENAME=quokka\n',
  "/etc/resolv.conf": "nameserver 1.1.1.1\nnameserver 1.1.1.1\nnameserver 2001:db8::53\n",
  "/proc/cpuinfo": "processor : 0\nmodel name : Fixture 9000\ncpu MHz : 3200.000",
  "/proc/meminfo": "MemTotal: 16777216 kB\nMemAvailable: 12582912 kB\n",
};

test("collects a deterministic Linux report and honors an explicit title", async () => {
  const context = fixture({
    commands: linuxCommands,
    files: linuxFiles,
    available: ["hostname", "ip", "lscpu", "nproc", "lastlog"],
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
      [key(["sw_vers", "-productName"])]: "macOS",
      [key(["sw_vers", "-productVersion"])]: "26.0",
      [key(["sw_vers", "-buildVersion"])]: "25A123",
      [key(["uname"])]: "Darwin",
      [key(["uname", "-r"])]: "25.0.0",
      [key(["sysctl", "-n", "machdep.cpu.brand_string"])]: "",
      [key(["sysctl", "-n", "hw.model"])]: "Mac16,1",
      [key(["sysctl", "-n", "hw.ncpu"])]: "10",
      [key(["sysctl", "-n", "hw.physicalcpu"])]: "10",
      [key(["sysctl", "-n", "hw.cpufrequency"])]: "",
      [key(["sysctl", "-n", "kern.hv_vmm_present"])]: "0",
      [key(["uptime"])]: "load averages: 0.10 0.20 0.30",
      [key(["sysctl", "-n", "hw.memsize"])]: "17179869184",
      [key(["sysctl", "-n", "hw.pagesize"])]: "16384",
      [key(["vm_stat"])]: "Pages free: 1000.\nPages inactive: 2000.\nPages speculative: 100.",
    };
    const context = fixture({ platform: "darwin", commands });
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
  expect(parseArgs(["--json", "--strict", "--title", "Worker"])).toEqual({
    action: "run",
    format: "json",
    strict: true,
    title: "Worker",
  });
  expect(() => parseArgs(["unknown"])).toThrow("unknown option");
  expect(() => parseArgs(["--title"])).toThrow("requires a value");
});

test("help and version succeed while an invalid command fails", async () => {
  for (const option of ["--help", "--version"]) {
    const child = Bun.spawn(["bun", "src/cli.ts", option], { cwd: import.meta.dir + "/.." });
    expect(await child.exited).toBe(0);
  }
  const child = Bun.spawn(["bun", "src/cli.ts", "invalid"], {
    cwd: import.meta.dir + "/..",
    stderr: "pipe",
  });
  expect(await child.exited).toBe(2);
});

test("the default context records failed probes for strict mode", async () => {
  const context = createProbeContext();
  await context.run(["lemonaid-machine-report-command-that-does-not-exist"]);
  expect(context.failures.size).toBe(1);
});
