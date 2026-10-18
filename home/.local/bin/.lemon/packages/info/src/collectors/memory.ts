import {
  MemInfoField,
  SysctlKey,
  SysctlOption,
  SystemCommand,
  SystemPath,
  VMStatField,
} from "../tokens";
import { numeric } from "../context";
import { Platform, type MachineReport, type ProbeContext } from "../types";

export async function collectMemory(context: ProbeContext): Promise<MachineReport["memory"]> {
  if (context.platform === Platform.Darwin) {
    const [total, pageSize, vmStat] = await Promise.all([
      context.run([SystemCommand.Sysctl, SysctlOption.Name, SysctlKey.MemorySize]),
      context.run([SystemCommand.Sysctl, SysctlOption.Name, SysctlKey.PageSize]),
      context.run([SystemCommand.VmStat]),
    ]);
    const totalKiB = numeric(total.stdout) / 1024;
    const pages = (label: VMStatField) =>
      numeric(vmStat.stdout.match(new RegExp(`^Pages ${label}:\\s+(\\d+)\\.`, "m"))?.[1]);
    const availablePages =
      pages(VMStatField.Free) + pages(VMStatField.Inactive) + pages(VMStatField.Speculative);
    return {
      totalKiB,
      usedKiB: Math.max(0, totalKiB - (availablePages * numeric(pageSize.stdout, 4096)) / 1024),
    };
  }
  const contents = (await context.readText(SystemPath.MemInfo)) ?? "";
  const value = (label: MemInfoField) =>
    numeric(contents.match(new RegExp(`^${label}:\\s+(\\d+)`, "m"))?.[1]);
  const totalKiB = value(MemInfoField.Total);
  return {
    totalKiB,
    usedKiB: Math.max(0, totalKiB - (value(MemInfoField.Available) || value(MemInfoField.Free))),
  };
}
