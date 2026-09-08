import { numeric } from "../context";
import type { MachineReport, ProbeContext } from "../types";

export async function collectDisk(context: ProbeContext): Promise<MachineReport["disk"]> {
  const result = await context.run(["df", "-Pm", "/"]);
  const fields = result.stdout.trim().split("\n").at(-1)?.trim().split(/\s+/) ?? [];
  return { totalMiB: numeric(fields[1]), usedMiB: numeric(fields[2]) };
}
