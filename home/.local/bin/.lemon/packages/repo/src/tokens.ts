export enum GitCommand {
  Remote = "remote",
  GetUrl = "get-url",
  RevParse = "rev-parse",
  Branch = "branch",
  Blame = "blame",
  Init = "init",
  Config = "config",
  Add = "add",
  Commit = "commit",
  Checkout = "checkout",
}

export enum GitOption {
  ShowToplevel = "--show-toplevel",
  ShowCurrent = "--show-current",
  Lines = "-L",
  Branch = "-b",
  Message = "-m",
}

export enum GitRemote {
  Origin = "origin",
  Upstream = "upstream",
}

export enum GitRevision {
  Head = "HEAD",
}

export enum GitConfigKey {
  UserEmail = "user.email",
  UserName = "user.name",
}

export enum RepoCommand {
  Blame = "blame",
}

export enum FzfOption {
  Prompt = "--prompt",
  Height = "--height",
  Border = "--border",
}
