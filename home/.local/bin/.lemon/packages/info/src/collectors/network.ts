import { clean } from "../context";
import type { MachineReport, ProbeContext } from "../types";

export function parseIPOutput(output: string): string | undefined {
  for (const line of output.split("\n")) {
    const match = line.match(/^\d+:\s+([^\s]+).*?\sinet6?\s+([^\s/]+)/);
    if (!match) continue;
    const device = match[1]!.replace(/@.*$/, "");
    const address = match[2]!;
    if (
      !/^(lo|docker|br-|veth)/.test(device) &&
      address !== "::1" &&
      !address.startsWith("fe80:")
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
    if (match?.[1] !== undefined && match[1] !== "127.0.0.1") return match[1];
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
  const hostnameCommand = context.hasCommand("hostname")
    ? context.run(["hostname", "-f"])
    : context.run(["uname", "-n"]);
  const usingIP = context.hasCommand("ip");
  const addressCommand = usingIP
    ? context.run(["ip", "-o", "addr", "show"])
    : context.hasCommand("ifconfig")
      ? context.run(["ifconfig"])
      : Promise.resolve({ stdout: "", stderr: "", exitCode: 127 });
  const dnsCommand =
    context.platform === "darwin" && context.hasCommand("scutil")
      ? context.run(["scutil", "--dns"]).then((result) => result.stdout)
      : context.readText("/etc/resolv.conf").then((value) => value ?? "");
  const [user, hostnameResult, addressResult, who, dns] = await Promise.all([
    context.run(["whoami"]),
    hostnameCommand,
    addressCommand,
    context.run(["who", "am", "i"]),
    dnsCommand,
  ]);
  let hostname = clean(hostnameResult.stdout);
  if (!hostname && context.hasCommand("hostname"))
    hostname = clean((await context.run(["hostname"])).stdout);
  return {
    hostname: hostname || "Not Defined",
    machineIP:
      (usingIP ? parseIPOutput(addressResult.stdout) : parseIfconfig(addressResult.stdout)) ||
      "No IP found",
    clientIP: clean(who.stdout.match(/\(([^)]+)\)\s*$/)?.[1], "Not connected"),
    dnsIPs: parseDNS(dns),
    currentUser: clean(user.stdout, context.env.USER || "Unknown"),
  };
}
