import { clean, numeric, valueAfterColon } from "../context";
import type { MachineReport, ProbeContext } from "../types";

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
  if (context.platform === "darwin") {
    const [model, hardware, cores, physical, frequency, virtualized, uptime] = await Promise.all([
      context.run(["sysctl", "-n", "machdep.cpu.brand_string"]),
      context.run(["sysctl", "-n", "hw.model"]),
      context.run(["sysctl", "-n", "hw.ncpu"]),
      context.run(["sysctl", "-n", "hw.physicalcpu"]),
      context.run(["sysctl", "-n", "hw.cpufrequency"]),
      context.run(["sysctl", "-n", "kern.hv_vmm_present"]),
      context.run(["uptime"]),
    ]);
    const frequencyHz = numeric(frequency.stdout);
    const frequencyGHz = frequencyHz > 0 ? frequencyHz / 1_000_000_000 : undefined;
    return {
      model: clean(model.stdout, clean(hardware.stdout, "Unknown")),
      cores: Math.max(1, numeric(cores.stdout, 1)),
      coresPerSocket: Math.max(1, numeric(physical.stdout, numeric(cores.stdout, 1))),
      sockets: 1,
      hypervisor: clean(virtualized.stdout) === "1" ? "Virtualized" : "Bare Metal",
      ...(frequencyGHz === undefined ? {} : { frequencyGHz }),
      loadAverage: parseLoadAverage(uptime.stdout),
    };
  }
  const [lscpu, cpuinfo, nproc, uptime] = await Promise.all([
    context.hasCommand("lscpu")
      ? context.run(["lscpu"])
      : Promise.resolve({ stdout: "", stderr: "", exitCode: 127 }),
    context.readText("/proc/cpuinfo"),
    context.hasCommand("nproc")
      ? context.run(["nproc", "--all"])
      : Promise.resolve({ stdout: "", stderr: "", exitCode: 127 }),
    context.run(["uptime"]),
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
    hypervisor: clean(valueAfterColon(lscpu.stdout, /^Hypervisor vendor$/i), "Bare Metal"),
    ...(frequencyGHz === undefined ? {} : { frequencyGHz }),
    loadAverage: parseLoadAverage(uptime.stdout),
  };
}
