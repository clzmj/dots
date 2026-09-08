import type { ProviderName } from "../remote.ts";
import { github } from "./github.ts";
import { gitlab } from "./gitlab.ts";
import type { ForgeProvider } from "./types.ts";

const providers: Record<ProviderName, ForgeProvider> = { github, gitlab };

export function provider(name: ProviderName): ForgeProvider {
  return providers[name];
}

export type { ForgeProvider, LineRange, ResourceTarget } from "./types.ts";
