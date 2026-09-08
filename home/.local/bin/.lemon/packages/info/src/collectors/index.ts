import { clean } from "../context";
import type { MachineReport, ProbeContext } from "../types";
import { collectCPU } from "./cpu";
import { collectDisk } from "./disk";
import { collectLogin } from "./login";
import { collectMemory } from "./memory";
import { collectNetwork } from "./network";
import { collectOS } from "./os";

export interface CollectOptions {
  title?: string;
}

export async function collectMachineReport(
  context: ProbeContext,
  options: CollectOptions = {},
): Promise<MachineReport> {
  const configuredTitle =
    options.title ||
    context.env.LEMON_INFO_TITLE ||
    context.env.MACHINE_REPORT_TITLE ||
    context.env.TR100_TITLE;
  const titlePromise = configuredTitle
    ? Promise.resolve(configuredTitle)
    : Promise.all([context.run(["whoami"]), context.run(["hostname", "-s"])]).then(([user, host]) =>
        clean(`${user.stdout} @ ${host.stdout}`, "Machine"),
      );
  const [title, os, network, cpu, memory, disk, login] = await Promise.all([
    titlePromise,
    collectOS(context),
    collectNetwork(context),
    collectCPU(context),
    collectMemory(context),
    collectDisk(context),
    collectLogin(context),
  ]);
  return { title, os, network, cpu, memory, disk, login };
}
