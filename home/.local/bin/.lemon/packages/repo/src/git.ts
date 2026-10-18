import { GitCommand, GitOption, GitRemote, GitRevision } from "./tokens.ts";
import { CliOption, ProcessIO, Executable } from "../../../shared/tokens.ts";
export type GitRunner = (
  args: readonly string[],
  cwd?: string,
  optional?: boolean,
) => Promise<string | undefined>;

export const runGit: GitRunner = async (args, cwd = process.cwd(), optional = false) => {
  const child = Bun.spawn([Executable.Git, ...args], {
    cwd,
    stdout: ProcessIO.Pipe,
    stderr: optional ? ProcessIO.Ignore : ProcessIO.Pipe,
  });
  const [output, diagnostics, status] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (status !== 0) {
    if (optional) return undefined;
    const detail = diagnostics.trim();
    throw new Error(`git ${args.join(" ")} failed${detail ? `: ${detail}` : ""}`);
  }
  return output.trim();
};

export interface RepositoryState {
  readonly root: string;
  readonly remote: string;
  readonly ref: string;
}

async function remoteUrl(
  root: string,
  remote: string,
  git: GitRunner,
): Promise<string | undefined> {
  return git([GitCommand.Remote, GitCommand.GetUrl, remote], root, true);
}

export async function repositoryState(
  cwd: string,
  options: { readonly remote?: string; readonly ref?: string } = {},
  git: GitRunner = runGit,
): Promise<RepositoryState> {
  const root = await git([GitCommand.RevParse, GitOption.ShowToplevel], cwd);
  if (!root) throw new Error("not inside a Git repository");

  let remote: string | undefined;
  if (options.remote) {
    remote = await remoteUrl(root, options.remote, git);
    if (!remote) throw new Error(`remote does not exist: ${options.remote}`);
  } else {
    remote = await remoteUrl(root, GitRemote.Origin, git);
    remote ??= await remoteUrl(root, GitRemote.Upstream, git);
    if (!remote) {
      const names = (await git([GitCommand.Remote], root, true))?.split("\n").filter(Boolean) ?? [];
      if (names.length === 1) remote = await remoteUrl(root, names[0]!, git);
      else if (names.length > 1)
        throw new Error("repository has multiple remotes; select one with --remote");
    }
  }
  if (!remote) throw new Error("repository has no remote");

  let ref = options.ref;
  if (!ref) ref = await git([GitCommand.Branch, GitOption.ShowCurrent], root, true);
  if (!ref) ref = await git([GitCommand.RevParse, GitRevision.Head], root, true);
  if (!ref) throw new Error("repository has no commit or branch to open");

  return { root, remote, ref };
}

export interface BlamedLine {
  readonly text: string;
  readonly sha: string;
}

export async function blameLine(
  root: string,
  relativePath: string,
  line: number,
  git: GitRunner = runGit,
): Promise<BlamedLine> {
  const text = await git(
    [GitCommand.Blame, GitOption.Lines, `${line},${line}`, CliOption.Separator, relativePath],
    root,
  );
  if (!text) throw new Error("git blame returned no line");
  let sha = text.split(/\s+/, 1)[0]!.replace(/^\^/, "");
  if (!/^[0-9a-f]{7,40}$/i.test(sha) || /^0+$/.test(sha))
    throw new Error("line does not belong to a committed revision");
  if (sha.length < 40) {
    const expanded = await git([GitCommand.RevParse, sha], root);
    if (!expanded || !/^[0-9a-f]{40}$/i.test(expanded))
      throw new Error("could not resolve blamed revision");
    sha = expanded;
  }
  return { text, sha };
}
