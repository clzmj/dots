import { DisplayValue, HostnameOption, InfoEnvironment, SystemCommand } from "../tokens";
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
    context.env[InfoEnvironment.LemonTitle] ||
    context.env[InfoEnvironment.MachineReportTitle] ||
    context.env[InfoEnvironment.LegacyTitle];
  const titlePromise = configuredTitle
    ? Promise.resolve(configuredTitle)
    : Promise.all([
        context.run([SystemCommand.Whoami]),
        context.run([SystemCommand.Hostname, HostnameOption.Short]),
      ]).then(([user, host]) => clean(`${user.stdout} @ ${host.stdout}`, DisplayValue.Machine));
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
