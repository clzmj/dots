// Shared runtime values for setup, package installers, and repository tooling.

export enum Executable {
  Sh = "sh",
  Bash = "bash",
  BashSystem = "/bin/bash",
  Dash = "dash",
  Zsh = "zsh",
  Bun = "bun",
  Node = "node",
  Sudo = "sudo",
  Tee = "tee",
  Chsh = "chsh",
  Id = "id",
  Getent = "getent",
  AptGet = "apt-get",
  Dnf = "dnf",
  Pacman = "pacman",
  Brew = "brew",
  Dpkg = "dpkg",
  Rpm = "rpm",
  Tar = "tar",
  Remove = "rm",
  Cargo = "cargo",
  Go = "go",
  Git = "git",
  Curl = "curl",
  Ripgrep = "rg",
  Fd = "fd",
  Bat = "bat",
  Eza = "eza",
  Fzf = "fzf",
  Lsof = "lsof",
  WlCopy = "wl-copy",
  Jq = "jq",
  Delta = "delta",
  Tokei = "tokei",
  Onefetch = "onefetch",
  Helix = "helix",
  Hx = "hx",
  Bottom = "btm",
  GitHub = "gh",
  Taplo = "taplo",
  Xclip = "xclip",
  Unzip = "unzip",
  Xz = "xz",
  CCompiler = "cc",
  Aws = "aws",
  Usql = "usql",
  Terraform = "terraform",
  TerraformLanguageServer = "terraform-ls",
  Tailscale = "tailscale",
  Claude = "claude",
  Codex = "codex",
  Opencode = "opencode",
  Herdr = "herdr",
  Uv = "uv",
  Zoxide = "zoxide",
  Starship = "starship",
  Just = "just",
  Worktrunk = "worktrunk",
  WorktrunkCommand = "wt",
  Gopls = "gopls",
  Speedtest = "speedtest",
  Pi = "pi",
  BashLanguageServer = "bash-language-server",
  TypeScriptLanguageServer = "typescript-language-server",
  YamlLanguageServer = "yaml-language-server",
  JsonLanguageServer = "vscode-json-language-server",
}

export enum CliFlag {
  DryRun = "--dry-run",
  Plan = "--plan",
  Write = "--write",
  StdinFilepath = "--stdin-filepath",
  Config = "--config",
  DenyWarnings = "--deny-warnings",
  Parallel = "--parallel",
  Isolate = "--isolate",
  Version = "--version",
}

export enum ShellFlag {
  Command = "-c",
  SyntaxCheck = "-n",
  Stdin = "-s",
}

export enum ChshFlag {
  Shell = "-s",
}

export enum IdFlag {
  PasswordEntry = "-P",
}

export enum TeeFlag {
  Append = "-a",
}

export enum PackageFlag {
  Yes = "-y",
  DpkgInstall = "-i",
  FixBroken = "-f",
  Quiet = "-qq",
  Sync = "-S",
  Needed = "--needed",
  NoConfirm = "--noconfirm",
  AllowErasing = "--allowerasing",
  RpmUpgrade = "-Uvh",
  ReplacePackages = "--replacepkgs",
  Cask = "--cask",
  Global = "-g",
  Locked = "--locked",
}

export enum CommandVerb {
  Install = "install",
  Update = "update",
  Test = "test",
  Password = "passwd",
}

export enum ArchiveFlag {
  Directory = "-C",
  ExtractGzip = "-xzf",
  ExtractXz = "-xJf",
}

export enum RemoveFlag {
  RecursiveForce = "-rf",
}

export enum RustupArgument {
  Separator = "--",
  NoModifyPath = "--no-modify-path",
  Profile = "--profile",
  MinimalProfile = "minimal",
}

export enum StreamMode {
  Pipe = "pipe",
  Inherit = "inherit",
  Ignore = "ignore",
}

export enum ProcessSignal {
  Terminate = "SIGTERM",
  Kill = "SIGKILL",
}

export enum SystemErrorCode {
  MissingFile = "ENOENT",
}

export enum TextEncoding {
  Utf8 = "utf8",
}

export enum EnvironmentKey {
  Home = "HOME",
  Path = "PATH",
  User = "USER",
  Logname = "LOGNAME",
  Shell = "SHELL",
  Zdotdir = "ZDOTDIR",
  Dots = "DOTS",
  SkipPackages = "DOTS_SKIP_PACKAGES",
  AssumeYes = "DOTS_YES",
  InstallMode = "DOTS_INSTALL_MODE",
  DryRun = "DOTS_DRY_RUN",
  DockerPlatform = "DOTS_DOCKER_PLATFORM",
  Name = "DOTS_NAME",
  Email = "DOTS_EMAIL",
  HomebrewPrefix = "HOMEBREW_PREFIX",
  NonInteractive = "NONINTERACTIVE",
  FakeBunLog = "FAKE_BUN_LOG",
}

export enum EnvironmentValue {
  Enabled = "1",
}

export enum RuntimePlatform {
  Windows = "win32",
}

export enum MachineArchitecture {
  X64 = "x64",
  X86_64 = "x86_64",
  Amd64 = "amd64",
  Arm64 = "arm64",
  Aarch64 = "aarch64",
}

export enum UserPath {
  Zshrc = ".zshrc",
  Zshenv = ".zshenv",
  LegacyGitConfig = ".gitconfig",
  LocalBin = ".local/bin",
  BunBin = ".bun/bin",
  CargoBin = ".cargo/bin",
  OpencodeBin = ".opencode/bin",
  GoBin = "go/bin",
  Answers = ".config/dots/answers",
  GitIdentity = ".config/git/local",
  Backup = ".dots-backup",
  HelixRuntime = ".config/helix/runtime",
  Hx = ".local/bin/hx",
  ZshConfig = ".config/zsh",
}

export enum RepositoryPath {
  Home = "home",
  HomeBin = "home/.local/bin",
  HomeZshrc = "home/.zshrc",
  HomeZshenv = "home/.zshenv",
  Lemon = "home/.local/bin/lemon",
  Bootstrap = "setup.sh",
  SetupSource = "src/setup.ts",
  GitDirectory = ".git/",
  NodeModules = "node_modules/",
  Formatter = "node_modules/.bin/oxfmt",
  Linter = "node_modules/.bin/oxlint",
  LintConfig = ".oxlintrc.json",
}

export enum SystemPath {
  Shells = "/etc/shells",
  LocalPrefix = "/usr/local",
  GoRoot = "/usr/local/go",
  GoBin = "/usr/local/go/bin",
  GoExecutable = "/usr/local/go/bin/go",
  HomebrewArmPrefix = "/opt/homebrew",
  HomebrewArmExecutable = "/opt/homebrew/bin/brew",
  HomebrewIntelExecutable = "/usr/local/bin/brew",
  ZshDarwin = "/bin/zsh",
  ZshLinux = "/usr/bin/zsh",
  Autosuggestions = "/usr/share/zsh-autosuggestions/zsh-autosuggestions.zsh",
  SyntaxHighlighting = "/usr/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh",
}

export enum FilePattern {
  Any = "*",
  Recursive = "**/*",
  Tests = "**/*.test.ts",
}

export enum DirectoryName {
  Bin = "bin",
  Share = "share",
}

export enum HomebrewPath {
  Prefix = "@brew/",
  Git = "@brew/git",
  Curl = "@brew/curl",
  Autosuggestions = "@brew/zsh-autosuggestions",
  SyntaxHighlighting = "@brew/zsh-syntax-highlighting",
}

export enum PackageName {
  Gcc = "gcc",
  Zsh = Executable.Zsh,
  Git = Executable.Git,
  Curl = Executable.Curl,
  Ripgrep = "ripgrep",
  FdFind = "fd-find",
  Bat = Executable.Bat,
  Eza = Executable.Eza,
  Fzf = Executable.Fzf,
  Lsof = Executable.Lsof,
  WlClipboard = "wl-clipboard",
  Jq = Executable.Jq,
  GitDelta = "git-delta",
  Tokei = Executable.Tokei,
  Onefetch = Executable.Onefetch,
  Helix = Executable.Helix,
  Golang = "golang",
  GitHub = Executable.GitHub,
  Xclip = Executable.Xclip,
  Unzip = Executable.Unzip,
  Xz = Executable.Xz,
  ZshAutosuggestions = "zsh-autosuggestions",
  ZshSyntaxHighlighting = "zsh-syntax-highlighting",
  Fd = Executable.Fd,
  Bottom = "bottom",
  Taplo = Executable.Taplo,
  Go = Executable.Go,
  AwsCli = "awscli",
  Usql = "xo/xo/usql",
  Terraform = "hashicorp/tap/terraform",
  TerraformLanguageServer = "hashicorp/tap/terraform-ls",
  XzUtils = "xz-utils",
  BuildEssential = "build-essential",
  CaCertificates = "ca-certificates",
  GitHubCli = "github-cli",
  JetBrainsMonoNerdFont = "font-jetbrains-mono-nerd-font",
  PiCodingAgent = "@earendil-works/pi-coding-agent",
  BashLanguageServer = Executable.BashLanguageServer,
  TypeScriptLanguageServer = Executable.TypeScriptLanguageServer,
  YamlLanguageServer = Executable.YamlLanguageServer,
  VsCodeLanguageServers = "vscode-langservers-extracted",
  Zoxide = Executable.Zoxide,
  Starship = Executable.Starship,
  Just = Executable.Just,
  Worktrunk = Executable.Worktrunk,
}

export enum ReleaseRepository {
  Fd = "sharkdp/fd",
  Bat = "sharkdp/bat",
  Bottom = "ClementTsang/bottom",
  GitHub = "cli/cli",
  Onefetch = "o2sh/onefetch",
  Taplo = "tamasfe/taplo",
  Helix = "helix-editor/helix",
}

export enum PackageTaskName {
  Homebrew = "homebrew",
  Bottom = PackageName.Bottom,
  BunGlobals = "bun globals",
}
