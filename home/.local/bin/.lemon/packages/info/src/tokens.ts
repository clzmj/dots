export enum SystemCommand {
  Whoami = "whoami",
  Hostname = "hostname",
  Who = "who",
  IP = "ip",
  Uname = "uname",
  Lscpu = "lscpu",
  Nproc = "nproc",
  Uptime = "uptime",
  DiskFree = "df",
  Lastlog = "lastlog",
  Last = "last",
  Sysctl = "sysctl",
  VmStat = "vm_stat",
  SwVers = "sw_vers",
  Ifconfig = "ifconfig",
  Scutil = "scutil",
}

export enum HostnameOption {
  Short = "-s",
  FullyQualified = "-f",
}

export enum WhoArgument {
  Am = "am",
  I = "i",
}

export enum IPArgument {
  Oneline = "-o",
  Address = "addr",
  Show = "show",
}

export enum UnameOption {
  Release = "-r",
  NodeName = "-n",
}

export enum NprocOption {
  All = "--all",
}

export enum UptimeOption {
  Pretty = "-p",
}

export enum DiskOption {
  Megabytes = "-Pm",
}

export enum LastOption {
  MostRecent = "-1",
}

export enum LastlogOption {
  User = "-u",
}

export enum SysctlOption {
  Name = "-n",
}

export enum SwVersOption {
  ProductName = "-productName",
  ProductVersion = "-productVersion",
  BuildVersion = "-buildVersion",
}

export enum ScutilOption {
  DNS = "--dns",
}

export enum SystemPath {
  Root = "/",
  OSRelease = "/etc/os-release",
  ResolvConf = "/etc/resolv.conf",
  CPUInfo = "/proc/cpuinfo",
  MemInfo = "/proc/meminfo",
}

export enum InfoEnvironment {
  User = "USER",
  LemonTitle = "LEMON_INFO_TITLE",
  MachineReportTitle = "MACHINE_REPORT_TITLE",
  LegacyTitle = "TR100_TITLE",
}

export enum SysctlKey {
  CPUBrand = "machdep.cpu.brand_string",
  HardwareModel = "hw.model",
  CPUCount = "hw.ncpu",
  PhysicalCPUCount = "hw.physicalcpu",
  CPUFrequency = "hw.cpufrequency",
  Virtualized = "kern.hv_vmm_present",
  MemorySize = "hw.memsize",
  PageSize = "hw.pagesize",
  BootTime = "kern.boottime",
}

export enum VMStatField {
  Free = "free",
  Inactive = "inactive",
  Speculative = "speculative",
}

export enum MemInfoField {
  Total = "MemTotal",
  Available = "MemAvailable",
  Free = "MemFree",
}

export enum OSReleaseField {
  ID = "ID",
  VersionID = "VERSION_ID",
  Version = "VERSION",
  VersionCodename = "VERSION_CODENAME",
}

export enum NetworkAddress {
  IPv4Loopback = "127.0.0.1",
  IPv6Loopback = "::1",
  IPv6LinkLocalPrefix = "fe80:",
}

export enum ProbeValue {
  Enabled = "1",
}

export enum DisplayValue {
  Unknown = "Unknown",
  BareMetal = "Bare Metal",
  Virtualized = "Virtualized",
  NeverLoggedIn = "Never logged in",
  NotDefined = "Not Defined",
  NoIPFound = "No IP found",
  NotConnected = "Not connected",
  Machine = "Machine",
}

export enum OSName {
  MacOS = "macOS",
  Linux = "Linux",
  Darwin = "Darwin",
}
