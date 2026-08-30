import { describe, expect, test } from "bun:test";
import {
  barGraph,
  collectCPU,
  collectMachineReport,
  collectMemory,
  collectOS,
  parseIPOutput,
  parseLoadAverage,
  renderMachineReport,
  type CommandResult,
  type MachineReport,
  type Platform,
  type ProbeContext,
} from "../home/.local/bin/machine-report";

const commandKey = (command: readonly string[]) => command.join("\0");

function fixtureContext(
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
    hasCommand: (command) => (options.available ?? []).includes(command),
    readText: async (path) => options.files?.[path],
    now: () => options.now ?? 0,
    run: async (command) => {
      const fixture = commands[commandKey(command)];
      if (typeof fixture === "string") {
        return { stdout: fixture, stderr: "", exitCode: 0 };
      }
      return fixture ?? { stdout: "", stderr: "not found", exitCode: 127 };
    },
  };
}

const linuxCommands = {
  [commandKey(["whoami"])]: "ada",
  [commandKey(["hostname", "-s"])]: "lab",
  [commandKey(["hostname", "-f"])]: "lab.example.test",
  [commandKey(["who", "am", "i"])]: "ada pts/1 2026-08-25 12:00 (203.0.113.8)",
  [commandKey(["ip", "-o", "addr", "show"])]: [
    "1: lo    inet 127.0.0.1/8 scope host lo",
    "2: eth0  inet 192.0.2.42/24 brd 192.0.2.255 scope global eth0",
  ].join("\n"),
  [commandKey(["uname"])]: "Linux",
  [commandKey(["uname", "-r"])]: "6.12.1-test",
  [commandKey(["lscpu"])]: [
    "Model name: Fixture Hyperfast 9000",
    "Core(s) per socket: 4",
    "Socket(s): 2",
    "Hypervisor vendor: KVM",
  ].join("\n"),
  [commandKey(["nproc", "--all"])]: "8",
  [commandKey(["uptime"])]: "12:00 up 4 days, load average: 1.50, 0.75, 0.25",
  [commandKey(["df", "-Pm", "/"])]: [
    "Filesystem 1048576-blocks Used Available Capacity Mounted on",
    "/dev/root 102400 25600 76800 25% /",
  ].join("\n"),
  [commandKey(["lastlog", "-u", "fixture"])]: [
    "Username Port From Latest",
    "fixture pts/1 198.51.100.7 Tue Aug 25 10:30:00 +0000 2026",
  ].join("\n"),
  [commandKey(["uptime", "-p"])]: "up 4 days, 2 hours, 3 minutes",
} satisfies Record<string, string>;

const linuxFiles = {
  "/etc/os-release": 'ID=ubuntu\nVERSION_ID="26.04"\nVERSION_CODENAME=quokka\n',
  "/etc/resolv.conf": "nameserver 1.1.1.1\nnameserver 2001:4860:4860::8888\n",
  "/proc/cpuinfo": [
    "processor : 0",
    "model name : Fixture Hyperfast 9000",
    "cpu MHz : 3200.000",
  ].join("\n"),
  "/proc/meminfo": "MemTotal:       16777216 kB\nMemAvailable:   12582912 kB\n",
};

describe("fixture-backed collectors", () => {
  test("collects a deterministic Linux report", async () => {
    const context = fixtureContext({
      commands: linuxCommands,
      files: linuxFiles,
      available: ["hostname", "ip", "lscpu", "nproc", "lastlog"],
      env: { USER: "fixture", TR100_TITLE: "Fixture 🚀" },
    });

    const report = await collectMachineReport(context);

    expect(report.title).toBe("Fixture 🚀");
    expect(report.os).toEqual({ name: "Ubuntu 26.04 Quokka", kernel: "Linux 6.12.1-test" });
    expect(report.network).toEqual({
      hostname: "lab.example.test",
      machineIP: "192.0.2.42",
      clientIP: "203.0.113.8",
      dnsIPs: ["1.1.1.1", "2001:4860:4860::8888"],
      currentUser: "ada",
    });
    expect(report.cpu).toMatchObject({
      model: "Fixture Hyperfast 9000",
      cores: 8,
      coresPerSocket: 4,
      sockets: 2,
      hypervisor: "KVM",
      frequencyGHz: 3.2,
      loadAverage: [1.5, 0.75, 0.25],
    });
    expect(report.memory).toEqual({ totalKiB: 16_777_216, usedKiB: 4_194_304 });
    expect(report.disk).toEqual({ totalMiB: 102_400, usedMiB: 25_600 });
    expect(report.login).toEqual({
      lastLogin: "Tue Aug 25 10:30:00 +0000 2026",
      lastLoginIP: "198.51.100.7",
      uptime: "4d, 2h, 3m",
    });
  });

  test("parses Darwin probes without using the host", async () => {
    const commands = {
      [commandKey(["sw_vers", "-productName"])]: "macOS",
      [commandKey(["sw_vers", "-productVersion"])]: "26.0",
      [commandKey(["sw_vers", "-buildVersion"])]: "25A123",
      [commandKey(["uname"])]: "Darwin",
      [commandKey(["uname", "-r"])]: "25.0.0",
      [commandKey(["sysctl", "-n", "machdep.cpu.brand_string"])]: "",
      [commandKey(["sysctl", "-n", "hw.model"])]: "Mac16,1",
      [commandKey(["sysctl", "-n", "hw.ncpu"])]: "10",
      [commandKey(["sysctl", "-n", "hw.physicalcpu"])]: "10",
      [commandKey(["sysctl", "-n", "hw.cpufrequency"])]: "",
      [commandKey(["sysctl", "-n", "kern.hv_vmm_present"])]: "0",
      [commandKey(["uptime"])]: "12:00  up 2 days, load averages: 0.10 0.20 0.30",
      [commandKey(["sysctl", "-n", "hw.memsize"])]: "17179869184",
      [commandKey(["sysctl", "-n", "hw.pagesize"])]: "16384",
      [commandKey(["vm_stat"])]: [
        "Pages free: 1000.",
        "Pages inactive: 2000.",
        "Pages speculative: 100.",
      ].join("\n"),
    };
    const context = fixtureContext({ platform: "darwin", commands });

    const [os, cpu, memory] = await Promise.all([
      collectOS(context),
      collectCPU(context),
      collectMemory(context),
    ]);

    expect(os).toEqual({ name: "macOS 26.0 25A123", kernel: "Darwin 25.0.0" });
    expect(cpu).toMatchObject({
      model: "Mac16,1",
      cores: 10,
      coresPerSocket: 10,
      sockets: 1,
      hypervisor: "Bare Metal",
      loadAverage: [0.1, 0.2, 0.3],
    });
    expect(cpu.frequencyGHz).toBeUndefined();
    expect(memory.totalKiB).toBe(16_777_216);
    expect(memory.usedKiB).toBe(16_727_616);
  });
});

describe("portable parsing and rendering", () => {
  test("parses addresses and load averages", () => {
    expect(parseIPOutput("1: lo inet 127.0.0.1/8\n2: enp0s1 inet6 2001:db8::2/64")).toBe(
      "2001:db8::2",
    );
    expect(parseLoadAverage("load averages: 1.25 2.50 3.75")).toEqual([1.25, 2.5, 3.75]);
    expect(barGraph(1, 4, 8)).toBe("██░░░░░░");
  });

  test("keeps every ANSI and Unicode table line aligned", () => {
    const report: MachineReport = {
      title: "\x1b[36mLab 🧪 report with a title that is much too long\x1b[0m",
      os: { name: "Ubuntu 26.04", kernel: "Linux 6.12" },
      network: {
        hostname: "host.example.test",
        machineIP: "192.0.2.42",
        clientIP: "Not connected",
        dnsIPs: ["2001:4860:4860::8888"],
        currentUser: "测试者",
      },
      cpu: {
        model: "\x1b[31mAn exceptionally verbose processor name 🚀\x1b[0m",
        cores: 8,
        coresPerSocket: 4,
        sockets: 2,
        hypervisor: "Bare Metal",
        loadAverage: [1, 2, 3],
      },
      memory: { usedKiB: 4_194_304, totalKiB: 16_777_216 },
      disk: { usedMiB: 25_600, totalMiB: 102_400 },
      login: { lastLogin: "Tue Aug 25 10:30", uptime: "4d 2h 3m" },
    };

    const output = renderMachineReport(report);
    const widths = output
      .trimEnd()
      .split("\n")
      .map((line) => Bun.stringWidth(line));

    expect(new Set(widths).size).toBe(1);
    expect(widths[0]).toBe(52);
    expect(output).toContain("...");
    expect(output).toContain("测试者");
  });
});

test("top-level collectors start concurrently", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const started: string[] = [];
  const context = fixtureContext({
    env: { USER: "fixture", TR100_TITLE: "Concurrent" },
    available: ["hostname", "ip", "lscpu", "nproc", "lastlog"],
    files: linuxFiles,
  });
  context.run = async (command) => {
    started.push(commandKey(command));
    await gate;
    return { stdout: linuxCommands[commandKey(command)] ?? "", stderr: "", exitCode: 0 };
  };

  const pending = collectMachineReport(context);
  await Promise.resolve();

  expect(started).toContain(commandKey(["uname"]));
  expect(started).toContain(commandKey(["hostname", "-f"]));
  expect(started).toContain(commandKey(["lscpu"]));
  expect(started).toContain(commandKey(["df", "-Pm", "/"]));
  expect(started).toContain(commandKey(["lastlog", "-u", "fixture"]));
  release();
  await pending;
});
