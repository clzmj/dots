import {
  DisplayValue,
  InfoEnvironment,
  LastOption,
  LastlogOption,
  SysctlKey,
  SysctlOption,
  SystemCommand,
  UptimeOption,
} from "../tokens";
import { clean, numeric } from "../context";
import { Platform, type MachineReport, type ProbeContext } from "../types";

function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const days = Math.floor(whole / 86_400);
  const hours = Math.floor((whole % 86_400) / 3_600);
  const minutes = Math.floor((whole % 3_600) / 60);
  return [days ? `${days}d` : "", hours ? `${hours}h` : "", `${minutes}m`]
    .filter(Boolean)
    .join(" ");
}

function parseLast(output: string): Pick<MachineReport["login"], "lastLogin" | "lastLoginIP"> {
  const line =
    output.split("\n").find((value, index) => index > 0 && value.trim()) ??
    output.split("\n")[0] ??
    "";
  if (!line || /Never logged in/i.test(line)) return { lastLogin: DisplayValue.NeverLoggedIn };
  const ip = line.match(/\b\d+(?:\.\d+){3}\b/)?.[0];
  const date = line.match(
    /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\w+\s+\d+\s+[\d:]+(?:\s+[+-]\d{4})?\s+\d{4}/,
  )?.[0];
  return {
    lastLogin: clean(date, clean(line, DisplayValue.NeverLoggedIn)),
    ...(ip === undefined ? {} : { lastLoginIP: ip }),
  };
}

export async function collectLogin(context: ProbeContext): Promise<MachineReport["login"]> {
  const user =
    context.env[InfoEnvironment.User] || clean((await context.run([SystemCommand.Whoami])).stdout);
  if (context.platform === Platform.Darwin) {
    const [last, boot] = await Promise.all([
      context.run([SystemCommand.Last, LastOption.MostRecent, user]),
      context.run([SystemCommand.Sysctl, SysctlOption.Name, SysctlKey.BootTime]),
    ]);
    const bootSeconds = numeric(boot.stdout.match(/sec\s*=\s*(\d+)/)?.[1]);
    return {
      ...parseLast(last.stdout),
      uptime: bootSeconds
        ? formatDuration(context.now() / 1000 - bootSeconds)
        : DisplayValue.Unknown,
    };
  }
  const hasLastlog = context.hasCommand(SystemCommand.Lastlog);
  const [last, uptime] = await Promise.all([
    hasLastlog
      ? context.run([SystemCommand.Lastlog, LastlogOption.User, user])
      : context.run([SystemCommand.Last, LastOption.MostRecent, user]),
    context.run([SystemCommand.Uptime, UptimeOption.Pretty]),
  ]);
  return {
    ...parseLast(last.stdout),
    uptime: clean(
      uptime.stdout
        .replace(/^up\s*/, "")
        .replace(/\s+days?/g, "d")
        .replace(/\s+hours?/g, "h")
        .replace(/\s+minutes?/g, "m"),
      DisplayValue.Unknown,
    ),
  };
}
