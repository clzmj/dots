import { describe, expect, test } from "bun:test";

import { ResourceKind } from "../src/target.ts";
import { provider } from "../src/providers/index.ts";
import { detectProvider, normalizeRemote, parseProviderName, ProviderName } from "../src/remote.ts";

describe("remote normalization", () => {
  test("normalizes common Git remote forms", () => {
    expect(normalizeRemote("git@github.com:acme/widgets.git")).toBe(
      "https://github.com/acme/widgets",
    );
    expect(normalizeRemote("ssh://git@gitlab.example/acme/widgets.git")).toBe(
      "https://gitlab.example/acme/widgets",
    );
    expect(normalizeRemote("git://github.com/acme/widgets.git/")).toBe(
      "https://github.com/acme/widgets",
    );
  });

  test("removes credentials, queries, and fragments", () => {
    expect(
      normalizeRemote("https://oauth2:secret@gitlab.com/acme/widgets.git?token=bad#fragment"),
    ).toBe("https://gitlab.com/acme/widgets");
  });

  test("rejects malformed and unsupported remotes", () => {
    expect(() => normalizeRemote("not a remote")).toThrow("unsupported remote URL");
    expect(() => normalizeRemote("file:///tmp/repo.git")).toThrow("unsupported remote protocol");
  });
});

describe("providers", () => {
  test("validates provider names at the CLI boundary", () => {
    expect(parseProviderName("github")).toBe(ProviderName.GitHub);
    expect(parseProviderName("gitlab")).toBe(ProviderName.GitLab);
    expect(() => parseProviderName("unknown")).toThrow("--provider must be");
  });
  test("detects GitHub and GitLab and requires overrides for unknown hosts", () => {
    expect(detectProvider("https://github.com/acme/widgets")).toBe(ProviderName.GitHub);
    expect(detectProvider("https://gitlab.example/acme/widgets")).toBe(ProviderName.GitLab);
    expect(() => detectProvider("https://code.example/acme/widgets")).toThrow("unknown forge");
    expect(detectProvider("https://code.example/acme/widgets", ProviderName.GitLab)).toBe(
      ProviderName.GitLab,
    );
  });

  test("builds provider-specific file, directory, commit, and line-range URLs", () => {
    const github = provider(ProviderName.GitHub);
    expect(
      github.resource("https://github.com/acme/widgets", {
        kind: ResourceKind.Blob,
        ref: "feature/a",
        path: "src/a file.ts",
        lines: { start: 7, end: 9 },
      }),
    ).toBe("https://github.com/acme/widgets/blob/feature%2Fa/src/a%20file.ts#L7-L9");
    expect(
      github.resource("https://github.com/acme/widgets", {
        kind: ResourceKind.Tree,
        ref: "main",
        path: "",
      }),
    ).toBe("https://github.com/acme/widgets/tree/main");

    const gitlab = provider(ProviderName.GitLab);
    expect(gitlab.commit("https://gitlab.com/acme/widgets", "abc1234")).toBe(
      "https://gitlab.com/acme/widgets/-/commit/abc1234",
    );
    expect(
      gitlab.resource("https://gitlab.com/acme/widgets", {
        kind: ResourceKind.Blob,
        ref: "main",
        path: "src/a.ts",
        lines: { start: 7, end: 9 },
      }),
    ).toBe("https://gitlab.com/acme/widgets/-/blob/main/src/a.ts#L7-9");
  });
});
