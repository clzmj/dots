export type ProviderName = "github" | "gitlab";

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
  if (!["http:", "https:", "ssh:", "git:"].includes(parsed.protocol))
    throw new Error(`unsupported remote protocol: ${parsed.protocol}`);
  const host = parsed.host;
  const path = cleanPath(parsed.pathname);
  return `https://${host}${path.startsWith("/") ? path : `/${path}`}`;
}

export function detectProvider(base: string, override?: ProviderName): ProviderName {
  if (override) return override;
  const hostname = new URL(base).hostname.toLowerCase();
  if (hostname === "github.com" || hostname.includes("github")) return "github";
  if (hostname === "gitlab.com" || hostname.includes("gitlab")) return "gitlab";
  throw new Error(`unknown forge host: ${hostname}; use --provider github|gitlab`);
}
