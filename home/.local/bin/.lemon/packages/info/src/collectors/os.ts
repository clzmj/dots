import { clean } from "../context";
import type { MachineReport, ProbeContext } from "../types";

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
  if (context.platform === "darwin") {
    const [name, version, build, uname, release] = await Promise.all([
      context.run(["sw_vers", "-productName"]),
      context.run(["sw_vers", "-productVersion"]),
      context.run(["sw_vers", "-buildVersion"]),
      context.run(["uname"]),
      context.run(["uname", "-r"]),
    ]);
    return {
      name: clean(`${name.stdout} ${version.stdout} ${build.stdout}`, "macOS"),
      kernel: clean(`${uname.stdout} ${release.stdout}`, "Darwin"),
    };
  }
  const [contents, uname, release] = await Promise.all([
    context.readText("/etc/os-release"),
    context.run(["uname"]),
    context.run(["uname", "-r"]),
  ]);
  const fields = parseOSRelease(contents ?? "");
  const id = fields.ID ? fields.ID[0]!.toUpperCase() + fields.ID.slice(1) : "Linux";
  const version = fields.VERSION_ID || fields.VERSION || "";
  const codename = fields.VERSION_CODENAME
    ? fields.VERSION_CODENAME[0]!.toUpperCase() + fields.VERSION_CODENAME.slice(1)
    : "";
  return {
    name: clean(`${id} ${version} ${codename}`, clean(uname.stdout, "Unknown")),
    kernel: clean(`${uname.stdout} ${release.stdout}`, "Unknown"),
  };
}
