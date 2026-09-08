import { realpathSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

export interface RepositoryTarget {
  readonly kind: "blob" | "tree";
  readonly path: string;
}

export function repositoryTarget(
  root: string,
  input?: string,
  cwd = process.cwd(),
): RepositoryTarget {
  const canonicalRoot = realpathSync(root);
  let target: string;
  try {
    target = realpathSync(resolve(cwd, input ?? cwd));
  } catch {
    throw new Error(`path does not exist: ${input ?? process.cwd()}`);
  }
  const relativePath = relative(canonicalRoot, target);
  if (relativePath === ".." || relativePath.startsWith("../") || relativePath.startsWith("..\\"))
    throw new Error("path is outside the repository");
  return {
    kind: statSync(target).isDirectory() ? "tree" : "blob",
    path: relativePath.replaceAll("\\", "/"),
  };
}
