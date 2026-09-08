import { numeric } from "../context";
import type { MachineReport, ProbeContext } from "../types";

export async function collectMemory(context: ProbeContext): Promise<MachineReport["memory"]> {
  if (context.platform === "darwin") {
    const [total, pageSize, vmStat] = await Promise.all([
      context.run(["sysctl", "-n", "hw.memsize"]),
      context.run(["sysctl", "-n", "hw.pagesize"]),
      context.run(["vm_stat"]),
    ]);
    const totalKiB = numeric(total.stdout) / 1024;
    const pages = (label: string) =>
      numeric(vmStat.stdout.match(new RegExp(`^Pages ${label}:\\s+(\\d+)\\.`, "m"))?.[1]);
    const availablePages = pages("free") + pages("inactive") + pages("speculative");
    return {
      totalKiB,
      usedKiB: Math.max(0, totalKiB - (availablePages * numeric(pageSize.stdout, 4096)) / 1024),
    };
  }
  const contents = (await context.readText("/proc/meminfo")) ?? "";
  const value = (label: string) =>
    numeric(contents.match(new RegExp(`^${label}:\\s+(\\d+)`, "m"))?.[1]);
  const totalKiB = value("MemTotal");
  return { totalKiB, usedKiB: Math.max(0, totalKiB - (value("MemAvailable") || value("MemFree"))) };
}
