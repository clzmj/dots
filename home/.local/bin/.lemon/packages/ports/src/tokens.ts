export enum LsofOption {
  Numeric = "-nP",
  Tcp = "-iTCP",
  Listening = "-sTCP:LISTEN",
  Fields = "-Fpcn",
}

export enum LsofField {
  Pid = "p",
  Command = "c",
  Name = "n",
}

export enum PsOption {
  Pid = "-p",
  Output = "-o",
}

export enum PsField {
  Command = "command=",
}

export enum ProcessErrorCode {
  NoSuchProcess = "ESRCH",
}
