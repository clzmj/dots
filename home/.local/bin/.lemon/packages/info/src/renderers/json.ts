import type { MachineReport } from "../types";

export function renderJSON(report: MachineReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
