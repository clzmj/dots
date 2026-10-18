export enum CliOption {
  Help = "--help",
  HelpShort = "-h",
  Version = "--version",
  VersionShort = "-v",
  Separator = "--",
  Backend = "--backend",
  Json = "--json",
  Title = "--title",
  Strict = "--strict",
  Open = "--open",
  Print = "--print",
  Copy = "--copy",
  Remote = "--remote",
  Ref = "--ref",
  Provider = "--provider",
  Line = "--line",
  Lines = "--lines",
  Action = "--action",
  List = "--list",
  Port = "--port",
  Verbose = "--verbose",
  All = "--all",
  Yes = "--yes",
  YesShort = "-y",
  NoKill = "--no-kill",
  Timeout = "--timeout",
  On = "--on",
  After = "--after",
  AlwaysZero = "--always-zero",
}

export enum ProcessIO {
  Inherit = "inherit",
  Pipe = "pipe",
  Ignore = "ignore",
}

export enum RuntimePlatform {
  Darwin = "darwin",
  Linux = "linux",
  Windows = "win32",
}

export enum Executable {
  Git = "git",
  Bun = "bun",
  Fzf = "fzf",
  Ps = "ps",
  Lsof = "lsof",
}

export enum DurationUnit {
  Millisecond = "ms",
  Second = "s",
  Minute = "m",
  Hour = "h",
}
