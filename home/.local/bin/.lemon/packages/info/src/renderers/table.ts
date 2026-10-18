import { DisplayValue } from "../tokens";
import type { MachineReport } from "../types";

const MIN_DATA_WIDTH = 20;
const MAX_DATA_WIDTH = 32;
const NAME_WIDTH = 13;

function percent(used: number, total: number): number {
  return total > 0 ? Math.max(0, Math.min(100, (used / total) * 100)) : 0;
}

export function barGraph(used: number, total: number, width: number): string {
  const blocks = Math.max(0, Math.min(width, Math.floor((percent(used, total) / 100) * width)));
  return "█".repeat(blocks) + "░".repeat(width - blocks);
}

function fitted(value: string, width: number): string {
  const wrapped = Bun.wrapAnsi(value.replace(/[\r\n]+/g, " "), width, { hard: true });
  const [first = "", ...rest] = wrapped.split("\n");
  if (rest.length === 0 && Bun.stringWidth(first) <= width) return first;
  return width <= 3 ? Bun.sliceAnsi(first, 0, width) : `${Bun.sliceAnsi(first, 0, width - 3)}...`;
}

function padded(value: string, width: number): string {
  const valueToUse = fitted(value, width);
  return valueToUse + " ".repeat(Math.max(0, width - Bun.stringWidth(valueToUse)));
}

function dataWidth(report: MachineReport): number {
  const values = [
    report.title,
    report.os.name,
    report.os.kernel,
    report.network.hostname,
    report.network.machineIP,
    report.network.clientIP,
    report.network.currentUser,
    report.cpu.model,
    report.cpu.hypervisor,
    report.login.lastLogin,
    report.login.lastLoginIP || "",
    report.login.uptime,
  ];
  return Math.max(
    MIN_DATA_WIDTH,
    Math.min(MAX_DATA_WIDTH, ...values.map((value) => Bun.stringWidth(value))),
  );
}

export function renderTable(report: MachineReport): string {
  const width = dataWidth(report);
  const totalWidth = width + NAME_WIDTH + 7;
  const lines: string[] = [];
  const row = (name: string, value: string) =>
    lines.push(`│ ${padded(name, NAME_WIDTH)} │ ${padded(value, width)} │`);
  const divider = (bottom = false) =>
    lines.push(
      `${bottom ? "└" : "├"}${"─".repeat(NAME_WIDTH + 2)}${bottom ? "┴" : "┼"}${"─".repeat(width + 2)}${bottom ? "┘" : "┤"}`,
    );
  const centered = (value: string) => {
    const valueToUse = fitted(value, totalWidth - 2);
    const remaining = totalWidth - 2 - Bun.stringWidth(valueToUse);
    const left = Math.floor(remaining / 2);
    lines.push(`│${" ".repeat(left)}${valueToUse}${" ".repeat(remaining - left)}│`);
  };
  const metric = (value: number) => value.toFixed(2);

  lines.push(`┌${"─".repeat(totalWidth - 2)}┐`);
  centered(report.title);
  centered("MACHINE REPORT");
  lines.push(`├${"─".repeat(totalWidth - 2)}┤`);
  row("OS", report.os.name);
  row("KERNEL", report.os.kernel);
  divider();
  row("HOSTNAME", report.network.hostname);
  row("MACHINE IP", report.network.machineIP);
  row("CLIENT IP", report.network.clientIP);
  report.network.dnsIPs.forEach((dns, index) => row(`DNS IP ${index + 1}`, dns));
  row("USER", report.network.currentUser);
  divider();
  row("PROCESSOR", report.cpu.model);
  row("CORES", `${report.cpu.coresPerSocket} vCPU(s) / ${report.cpu.sockets} Socket(s)`);
  row("HYPERVISOR", report.cpu.hypervisor);
  if (report.cpu.frequencyGHz) row("CPU FREQ", `${metric(report.cpu.frequencyGHz)} GHz`);
  row("LOAD 1m", barGraph(report.cpu.loadAverage[0], report.cpu.cores, width));
  row("LOAD 5m", barGraph(report.cpu.loadAverage[1], report.cpu.cores, width));
  row("LOAD 15m", barGraph(report.cpu.loadAverage[2], report.cpu.cores, width));
  divider();
  row(
    "VOLUME",
    report.disk.totalMiB > 0
      ? `${metric(report.disk.usedMiB / 1024)}/${metric(report.disk.totalMiB / 1024)} GiB [${metric(percent(report.disk.usedMiB, report.disk.totalMiB))}%]`
      : DisplayValue.Unknown,
  );
  row("DISK USAGE", barGraph(report.disk.usedMiB, report.disk.totalMiB, width));
  divider();
  row(
    "MEMORY",
    report.memory.totalKiB > 0
      ? `${metric(report.memory.usedKiB / 1_048_576)}/${metric(report.memory.totalKiB / 1_048_576)} GiB [${metric(percent(report.memory.usedKiB, report.memory.totalKiB))}%]`
      : DisplayValue.Unknown,
  );
  row("USAGE", barGraph(report.memory.usedKiB, report.memory.totalKiB, width));
  divider();
  row("LAST LOGIN", report.login.lastLogin);
  if (report.login.lastLoginIP) row("", report.login.lastLoginIP);
  row("UPTIME", report.login.uptime);
  divider(true);
  return `${lines.join("\n")}\n`;
}
