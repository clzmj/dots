import {
  DisplayValue,
  OSName,
  OSReleaseField,
  SwVersOption,
  SystemCommand,
  SystemPath,
  UnameOption,
} from "../tokens";
import { clean } from "../context";
import { Platform, type MachineReport, type ProbeContext } from "../types";

export function parseOSRelease(contents: string): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const rawLine of contents.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    let value = line.slice(separator + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    entries[line.slice(0, separator)] = value.replace(/\\([\\"$`])/g, "$1");
  }
  return entries;
}

export async function collectOS(context: ProbeContext): Promise<MachineReport["os"]> {
  if (context.platform === Platform.Darwin) {
    const [name, version, build, uname, release] = await Promise.all([
      context.run([SystemCommand.SwVers, SwVersOption.ProductName]),
      context.run([SystemCommand.SwVers, SwVersOption.ProductVersion]),
      context.run([SystemCommand.SwVers, SwVersOption.BuildVersion]),
      context.run([SystemCommand.Uname]),
      context.run([SystemCommand.Uname, UnameOption.Release]),
    ]);
    return {
      name: clean(`${name.stdout} ${version.stdout} ${build.stdout}`, OSName.MacOS),
      kernel: clean(`${uname.stdout} ${release.stdout}`, OSName.Darwin),
    };
  }
  const [contents, uname, release] = await Promise.all([
    context.readText(SystemPath.OSRelease),
    context.run([SystemCommand.Uname]),
    context.run([SystemCommand.Uname, UnameOption.Release]),
  ]);
  const fields = parseOSRelease(contents ?? "");
  const id = fields[OSReleaseField.ID]
    ? fields[OSReleaseField.ID][0]!.toUpperCase() + fields[OSReleaseField.ID].slice(1)
    : OSName.Linux;
  const version = fields[OSReleaseField.VersionID] || fields[OSReleaseField.Version] || "";
  const codename = fields[OSReleaseField.VersionCodename]
    ? fields[OSReleaseField.VersionCodename][0]!.toUpperCase() +
      fields[OSReleaseField.VersionCodename].slice(1)
    : "";
  return {
    name: clean(`${id} ${version} ${codename}`, clean(uname.stdout, DisplayValue.Unknown)),
    kernel: clean(`${uname.stdout} ${release.stdout}`, DisplayValue.Unknown),
  };
}
