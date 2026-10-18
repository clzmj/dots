import { ProviderName } from "../remote.ts";
import { github } from "./github.ts";
import { gitlab } from "./gitlab.ts";
import type { ForgeProvider } from "./types.ts";

const providers: Record<ProviderName, ForgeProvider> = {
  [ProviderName.GitHub]: github,
  [ProviderName.GitLab]: gitlab,
};

export function provider(name: ProviderName): ForgeProvider {
  return providers[name];
}

export type { ForgeProvider, LineRange, ResourceTarget } from "./types.ts";
