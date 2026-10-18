import {
  DisplayValue,
  NprocOption,
  ProbeValue,
  SysctlKey,
  SysctlOption,
  SystemCommand,
  SystemPath,
} from "../tokens";
import { clean, numeric, valueAfterColon } from "../context";
import { Platform, type MachineReport, type ProbeContext } from "../types";

export function parseLoadAverage(output: string): [number, number, number] {
  const match = output.match(/load averages?:\s*([0-9.,]+)[, ]+\s*([0-9.,]+)[, ]+\s*([0-9.,]+)/i);
  return match
    ? [
        numeric(match[1]!.replace(",", ".")),
        numeric(match[2]!.replace(",", ".")),
        numeric(match[3]!.replace(",", ".")),
      ]
    : [0, 0, 0];
}

export async function collectCPU(context: ProbeContext): Promise<MachineReport["cpu"]> {
  if (context.platform === Platform.Darwin) {
    const [model, hardware, cores, physical, frequency, virtualized, uptime] = await Promise.all([
      context.run([SystemCommand.Sysctl, SysctlOption.Name, SysctlKey.CPUBrand]),
      context.run([SystemCommand.Sysctl, SysctlOption.Name, SysctlKey.HardwareModel]),
      context.run([SystemCommand.Sysctl, SysctlOption.Name, SysctlKey.CPUCount]),
      context.run([SystemCommand.Sysctl, SysctlOption.Name, SysctlKey.PhysicalCPUCount]),
      context.run([SystemCommand.Sysctl, SysctlOption.Name, SysctlKey.CPUFrequency]),
      context.run([SystemCommand.Sysctl, SysctlOption.Name, SysctlKey.Virtualized]),
      context.run([SystemCommand.Uptime]),
    ]);
    const frequencyHz = numeric(frequency.stdout);
    const frequencyGHz = frequencyHz > 0 ? frequencyHz / 1_000_000_000 : undefined;
    return {
      model: clean(model.stdout, clean(hardware.stdout, DisplayValue.Unknown)),
      cores: Math.max(1, numeric(cores.stdout, 1)),
      coresPerSocket: Math.max(1, numeric(physical.stdout, numeric(cores.stdout, 1))),
      sockets: 1,
      hypervisor:
        clean(virtualized.stdout) === ProbeValue.Enabled
          ? DisplayValue.Virtualized
          : DisplayValue.BareMetal,
      ...(frequencyGHz === undefined ? {} : { frequencyGHz }),
      loadAverage: parseLoadAverage(uptime.stdout),
    };
  }
  const [lscpu, cpuinfo, nproc, uptime] = await Promise.all([
    context.hasCommand(SystemCommand.Lscpu)
      ? context.run([SystemCommand.Lscpu])
      : Promise.resolve({ stdout: "", stderr: "", exitCode: 127 }),
    context.readText(SystemPath.CPUInfo),
    context.hasCommand(SystemCommand.Nproc)
      ? context.run([SystemCommand.Nproc, NprocOption.All])
      : Promise.resolve({ stdout: "", stderr: "", exitCode: 127 }),
    context.run([SystemCommand.Uptime]),
  ]);
  const info = cpuinfo ?? "";
  const cores = Math.max(
    1,
    numeric(nproc.stdout, (info.match(/^processor\s*:/gm) ?? []).length || 1),
  );
  const mhz = numeric(valueAfterColon(info, /^cpu MHz$/i));
  const frequencyGHz = mhz > 0 ? mhz / 1_000 : undefined;
  return {
    model: clean(
      valueAfterColon(lscpu.stdout, /^Model name$/i) ||
        valueAfterColon(info, /^(model name|Model|Hardware)$/i),
      `Unknown (${cores} cores)`,
    ),
    cores,
    coresPerSocket: Math.max(
      1,
      numeric(valueAfterColon(lscpu.stdout, /^Core\(s\) per socket$/i), cores),
    ),
    sockets: Math.max(1, numeric(valueAfterColon(lscpu.stdout, /^Socket\(s\)$/i), 1)),
    hypervisor: clean(
      valueAfterColon(lscpu.stdout, /^Hypervisor vendor$/i),
      DisplayValue.BareMetal,
    ),
    ...(frequencyGHz === undefined ? {} : { frequencyGHz }),
    loadAverage: parseLoadAverage(uptime.stdout),
  };
}
