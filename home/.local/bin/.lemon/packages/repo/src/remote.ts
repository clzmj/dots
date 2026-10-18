export enum ProviderName {
  GitHub = "github",
  GitLab = "gitlab",
}

enum RemoteProtocol {
  Http = "http:",
  Https = "https:",
  Ssh = "ssh:",
  Git = "git:",
}

export function parseProviderName(value: string): ProviderName {
  const name = Object.values(ProviderName).find((candidate) => candidate === value);
  if (name === undefined) throw new Error("--provider must be github or gitlab");
  return name;
}

function cleanPath(pathname: string): string {
  return pathname.replace(/\/+$/, "").replace(/\.git$/, "");
}

export function normalizeRemote(remote: string): string {
  const value = remote.trim();
  const scp = !value.includes("://") ? value.match(/^(?:[^@/\s]+@)?([^:/\s]+):(.+)$/) : null;
  if (scp) return `https://${scp[1]}/${cleanPath(scp[2]!)}`;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`unsupported remote URL: ${value}`);
  }
  if (!Object.values(RemoteProtocol).some((protocol) => protocol === parsed.protocol))
    throw new Error(`unsupported remote protocol: ${parsed.protocol}`);
  const host = parsed.host;
  const path = cleanPath(parsed.pathname);
  return `https://${host}${path.startsWith("/") ? path : `/${path}`}`;
}

export function detectProvider(base: string, override?: ProviderName): ProviderName {
  if (override) return override;
  const hostname = new URL(base).hostname.toLowerCase();
  if (hostname === "github.com" || hostname.includes(ProviderName.GitHub))
    return ProviderName.GitHub;
  if (hostname === "gitlab.com" || hostname.includes(ProviderName.GitLab))
    return ProviderName.GitLab;
  throw new Error(`unknown forge host: ${hostname}; use --provider github|gitlab`);
}
