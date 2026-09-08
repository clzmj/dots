import { describe, expect, test } from "bun:test";

import { blameLine, repositoryState, type GitRunner } from "../src/git.ts";

describe("repositoryState", () => {
  test("prefers origin, then upstream, then a sole named remote", async () => {
    const calls: string[] = [];
    const git: GitRunner = async (args) => {
      calls.push(args.join(" "));
      const command = args.join(" ");
      if (command === "rev-parse --show-toplevel") return "/repo";
      if (command === "remote get-url origin") return undefined;
      if (command === "remote get-url upstream") return "git@gitlab.com:acme/widgets.git";
      if (command === "branch --show-current") return "main";
      return undefined;
    };
    expect(await repositoryState("/repo/src", {}, git)).toEqual({
      root: "/repo",
      remote: "git@gitlab.com:acme/widgets.git",
      ref: "main",
    });
    expect(calls).toContain("remote get-url origin");
    expect(calls).toContain("remote get-url upstream");
  });

  test("uses HEAD in detached state and rejects ambiguous remotes", async () => {
    const detached: GitRunner = async (args) => {
      const command = args.join(" ");
      if (command === "rev-parse --show-toplevel") return "/repo";
      if (command === "remote get-url origin") return "https://github.com/acme/widgets.git";
      if (command === "branch --show-current") return "";
      if (command === "rev-parse HEAD") return "a".repeat(40);
      return undefined;
    };
    expect((await repositoryState("/repo", {}, detached)).ref).toBe("a".repeat(40));

    const ambiguous: GitRunner = async (args) => {
      const command = args.join(" ");
      if (command === "rev-parse --show-toplevel") return "/repo";
      if (command === "remote") return "alpha\nbeta";
      return undefined;
    };
    await expect(repositoryState("/repo", {}, ambiguous)).rejects.toThrow("multiple remotes");
  });
});

describe("blameLine", () => {
  test("strips the root-commit marker", async () => {
    const git: GitRunner = async (args) =>
      args[0] === "rev-parse"
        ? "abc1234000000000000000000000000000000000"
        : "^abc1234 (A U Thor 2026-01-01 1) line";
    expect((await blameLine("/repo", "a.ts", 1, git)).sha).toBe(
      "abc1234000000000000000000000000000000000",
    );
  });

  test("rejects all-zero uncommitted revisions", async () => {
    const git: GitRunner = async () => `${"0".repeat(40)} (Not Committed Yet) line`;
    await expect(blameLine("/repo", "a.ts", 1, git)).rejects.toThrow("committed revision");
  });
});
