import {
  DisplayValue,
  HostnameOption,
  IPArgument,
  InfoEnvironment,
  NetworkAddress,
  ScutilOption,
  SystemCommand,
  SystemPath,
  UnameOption,
  WhoArgument,
} from "../tokens";
import { clean } from "../context";
import { Platform, type MachineReport, type ProbeContext } from "../types";

export function parseIPOutput(output: string): string | undefined {
  for (const line of output.split("\n")) {
    const match = line.match(/^\d+:\s+([^\s]+).*?\sinet6?\s+([^\s/]+)/);
    if (!match) continue;
    const device = match[1]!.replace(/@.*$/, "");
    const address = match[2]!;
    if (
      !/^(lo|docker|br-|veth)/.test(device) &&
      address !== NetworkAddress.IPv6Loopback &&
      !address.startsWith(NetworkAddress.IPv6LinkLocalPrefix)
    ) {
      return address;
    }
  }
  return undefined;
}

export function parseIfconfig(output: string): string | undefined {
  let device = "";
  for (const line of output.split("\n")) {
    const header = line.match(/^([^\s:]+):?\s/);
    if (header) device = header[1]!;
    if (/^(lo|docker|utun|awdl|llw|bridge|veth)/.test(device)) continue;
    const match = line.match(/\binet\s+(?:addr:)?([^\s]+)/);
    if (match?.[1] !== undefined && match[1] !== NetworkAddress.IPv4Loopback) return match[1];
  }
  return undefined;
}

export function parseDNS(contents: string): string[] {
  const addresses: string[] = [];
  for (const match of contents.matchAll(
    /(?:^nameserver\s+|nameserver\[\d+\]\s*:\s*)([0-9a-f.:]+)/gim,
  )) {
    if (!addresses.includes(match[1]!)) addresses.push(match[1]!);
    if (addresses.length === 3) break;
  }
  return addresses;
}

export async function collectNetwork(context: ProbeContext): Promise<MachineReport["network"]> {
  const hostnameCommand = context.hasCommand(SystemCommand.Hostname)
    ? context.run([SystemCommand.Hostname, HostnameOption.FullyQualified])
    : context.run([SystemCommand.Uname, UnameOption.NodeName]);
  const usingIP = context.hasCommand(SystemCommand.IP);
  const addressCommand = usingIP
    ? context.run([SystemCommand.IP, IPArgument.Oneline, IPArgument.Address, IPArgument.Show])
    : context.hasCommand(SystemCommand.Ifconfig)
      ? context.run([SystemCommand.Ifconfig])
      : Promise.resolve({ stdout: "", stderr: "", exitCode: 127 });
  const dnsCommand =
    context.platform === Platform.Darwin && context.hasCommand(SystemCommand.Scutil)
      ? context.run([SystemCommand.Scutil, ScutilOption.DNS]).then((result) => result.stdout)
      : context.readText(SystemPath.ResolvConf).then((value) => value ?? "");
  const [user, hostnameResult, addressResult, who, dns] = await Promise.all([
    context.run([SystemCommand.Whoami]),
    hostnameCommand,
    addressCommand,
    context.run([SystemCommand.Who, WhoArgument.Am, WhoArgument.I]),
    dnsCommand,
  ]);
  let hostname = clean(hostnameResult.stdout);
  if (!hostname && context.hasCommand(SystemCommand.Hostname))
    hostname = clean((await context.run([SystemCommand.Hostname])).stdout);
  return {
    hostname: hostname || DisplayValue.NotDefined,
    machineIP:
      (usingIP ? parseIPOutput(addressResult.stdout) : parseIfconfig(addressResult.stdout)) ||
      DisplayValue.NoIPFound,
    clientIP: clean(who.stdout.match(/\(([^)]+)\)\s*$/)?.[1], DisplayValue.NotConnected),
    dnsIPs: parseDNS(dns),
    currentUser: clean(user.stdout, context.env[InfoEnvironment.User] || DisplayValue.Unknown),
  };
}
