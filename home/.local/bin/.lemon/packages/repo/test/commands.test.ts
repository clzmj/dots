import { GitCommand, GitOption, GitRemote, GitConfigKey } from "../src/tokens.ts";
import { CliOption, ProcessIO, Executable } from "../../../shared/tokens.ts";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ActionAdapters } from "../src/adapters.ts";
import { BlameAction, runBlame } from "../src/commands/blame.ts";
import { runOpen } from "../src/commands/open.ts";
import { repositoryTarget } from "../src/target.ts";

let root: string;
let output: string[];
let errors: string[];
let copied: string[];
let opened: string[];

async function git(...args: string[]): Promise<void> {
  const child = Bun.spawn([Executable.Git, ...args], {
    cwd: root,
    stdout: ProcessIO.Ignore,
    stderr: ProcessIO.Pipe,
  });
  const diagnostics = await new Response(child.stderr).text();
  if ((await child.exited) !== 0) throw new Error(diagnostics);
}

function adapters(choice?: string): ActionAdapters {
  return {
    open: async (url) => {
      opened.push(url);
      return 0;
    },
    copy: async (text) => {
      copied.push(text);
      return 0;
    },
    choose: async () => choice,
  };
}

function deps(choice?: string) {
  return {
    cwd: root,
    adapters: adapters(choice),
    io: {
      out: (message: string) => output.push(message),
      error: (message: string) => errors.push(message),
    },
  };
}

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "forge-test-"));
  output = [];
  errors = [];
  copied = [];
  opened = [];
  await git(GitCommand.Init, GitOption.Branch, "main");
  await git(GitCommand.Config, GitConfigKey.UserEmail, "test@example.com");
  await git(GitCommand.Config, GitConfigKey.UserName, "Test User");
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "a file.ts"), "first\nsecond\n");
  await git(GitCommand.Add, ".");
  await git(GitCommand.Commit, GitOption.Message, "initial");
  await git(GitCommand.Remote, GitCommand.Add, GitRemote.Origin, "git@github.com:acme/widgets.git");
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("forge open", () => {
  test("prints blob and tree URLs", async () => {
    expect(await runOpen(["src/a file.ts", CliOption.Print], deps())).toBe(0);
    expect(output.pop()).toBe("https://github.com/acme/widgets/blob/main/src/a%20file.ts");
    expect(await runOpen(["src", CliOption.Print], deps())).toBe(0);
    expect(output.pop()).toBe("https://github.com/acme/widgets/tree/main/src");
  });

  test("copies line ranges and encodes slash-containing refs", async () => {
    await git(GitCommand.Checkout, GitOption.Branch, "feature/demo");
    expect(await runOpen(["src/a file.ts", CliOption.Copy, CliOption.Lines, "1:2"], deps())).toBe(
      0,
    );
    expect(copied).toEqual([
      "https://github.com/acme/widgets/blob/feature%2Fdemo/src/a%20file.ts#L1-L2",
    ]);
  });

  test("opens through the injected adapter", async () => {
    expect(await runOpen([], deps())).toBe(0);
    expect(opened).toEqual(["https://github.com/acme/widgets/tree/main"]);
  });

  test("rejects missing, outside, and invalid line targets", async () => {
    expect(await runOpen(["missing", CliOption.Print], deps())).toBe(2);
    expect(errors.pop()).toContain("path does not exist");
    expect(await runOpen([tmpdir(), CliOption.Print], deps())).toBe(2);
    expect(errors.pop()).toContain("outside the repository");
    expect(await runOpen(["src", CliOption.Line, "1", CliOption.Print], deps())).toBe(2);
    expect(errors.pop()).toContain("line links require a file");
  });

  test("rejects symlinks that escape the repository", () => {
    const outside = mkdtempSync(join(tmpdir(), "forge-outside-"));
    const link = join(root, "outside-link");
    symlinkSync(outside, link);
    expect(() => repositoryTarget(root, "outside-link", root)).toThrow("outside the repository");
    rmSync(outside, { recursive: true, force: true });
  });
});

describe("forge blame", () => {
  test("rejects unknown actions from arguments and the interactive adapter", async () => {
    expect(await runBlame(["src/a file.ts", "1", CliOption.Action, "unknown"], deps())).toBe(2);
    expect(errors.pop()).toContain("unknown action");
    expect(await runBlame(["src/a file.ts", "1"], deps("unknown"))).toBe(2);
    expect(errors.pop()).toContain("unknown menu action");
    expect(copied).toEqual([]);
    expect(opened).toEqual([]);
  });
  test("prints a permalink from a real blame", async () => {
    expect(
      await runBlame(["src/a file.ts", "2", CliOption.Action, "print-permalink"], deps()),
    ).toBe(0);
    expect(output[0]).toMatch(
      /^https:\/\/github\.com\/acme\/widgets\/blob\/[0-9a-f]{40}\/src\/a%20file\.ts#L2$/,
    );
  });

  test("supports injected interactive copy and cancellation", async () => {
    expect(await runBlame(["src/a file.ts", "1"], deps(BlameAction.CopyHash))).toBe(0);
    expect(copied[0]).toMatch(/^[0-9a-f]{40}$/);
    expect(await runBlame(["src/a file.ts", "1"], deps())).toBe(0);
  });

  test("validates arguments and modified, uncommitted lines", async () => {
    expect(await runBlame(["src/a file.ts", "0"], deps())).toBe(2);
    expect(errors.pop()).toContain("positive integer");
    writeFileSync(join(root, "src", "a file.ts"), "new\nfirst\nsecond\n");
    expect(await runBlame(["src/a file.ts", "1", CliOption.Action, "print-hash"], deps())).toBe(2);
    expect(errors.pop()).toContain("committed revision");
  });
});
