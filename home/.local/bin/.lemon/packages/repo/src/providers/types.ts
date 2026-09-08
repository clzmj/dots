import type { ProviderName } from "../remote.ts";

export interface LineRange {
  readonly start: number;
  readonly end?: number;
}

export interface ResourceTarget {
  readonly kind: "blob" | "tree";
  readonly ref: string;
  readonly path: string;
  readonly lines?: LineRange;
}

export interface ForgeProvider {
  readonly name: ProviderName;
  commit(base: string, sha: string): string;
  resource(base: string, target: ResourceTarget): string;
}

export function encodePath(path: string): string {
  return path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
}
