import { CommandVerb, FilePattern, RepositoryPath, StreamMode } from "../src/lib/tokens";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const tests: string[] = [];

for await (const path of new Bun.Glob(FilePattern.Tests).scan({
  cwd: root,
  dot: true,
  onlyFiles: true,
})) {
  if (!path.startsWith(RepositoryPath.GitDirectory) && !path.startsWith(RepositoryPath.NodeModules))
    tests.push(`./${path}`);
}

const child = Bun.spawn(
  [process.execPath, CommandVerb.Test, ...Bun.argv.slice(2), ...tests.toSorted()],
  {
    cwd: root,
    stdin: StreamMode.Inherit,
    stdout: StreamMode.Inherit,
    stderr: StreamMode.Inherit,
  },
);

process.exit(await child.exited);
