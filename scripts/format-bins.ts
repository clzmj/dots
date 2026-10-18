import { CliFlag, FilePattern, RepositoryPath, StreamMode } from "../src/lib/tokens";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const oxfmt = join(root, RepositoryPath.Formatter);
const bin = join(root, RepositoryPath.HomeBin);
const write = Bun.argv.includes(CliFlag.Write);
const failures: string[] = [];
const commands: string[] = [];

for await (const name of new Bun.Glob(FilePattern.Any).scan({ cwd: bin, onlyFiles: true })) {
  commands.push(name);
}

await Promise.all(
  commands.toSorted().map(async (name) => {
    const path = join(bin, name);
    const source = await Bun.file(path).text();
    const child = Bun.spawn([oxfmt, CliFlag.StdinFilepath, `${path}.ts`], {
      cwd: root,
      stdin: StreamMode.Pipe,
      stdout: StreamMode.Pipe,
      stderr: StreamMode.Pipe,
    });
    child.stdin.write(source);
    child.stdin.end();
    const [code, formatted, diagnostics] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    if (code !== 0) {
      failures.push(name);
      if (diagnostics.trim()) console.error(diagnostics.trimEnd());
    } else if (formatted !== source) {
      if (write) await Bun.write(path, formatted);
      else failures.push(name);
    }
  }),
);

if (failures.length > 0) {
  console.error(`Bun command formatting failed: ${failures.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`${write ? "Formatted" : "Checked"} ${commands.length} extensionless Bun commands`);
}
