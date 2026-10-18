import { ProviderName } from "../remote.ts";
import type { ForgeProvider } from "./types.ts";
import { encodePath } from "./types.ts";

export const github: ForgeProvider = {
  name: ProviderName.GitHub,
  commit: (base, sha) => `${base}/commit/${encodeURIComponent(sha)}`,
  resource(base, target) {
    const path = encodePath(target.path);
    const suffix = path ? `/${path}` : "";
    const lines = target.lines;
    const anchor = lines ? `#L${lines.start}${lines.end ? `-L${lines.end}` : ""}` : "";
    return `${base}/${target.kind}/${encodeURIComponent(target.ref)}${suffix}${anchor}`;
  },
};
