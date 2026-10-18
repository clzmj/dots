import { CliFlag, FilePattern, RepositoryPath, StreamMode } from "../src/lib/tokens";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const oxlint = join(root, RepositoryPath.Linter);
const config = join(root, RepositoryPath.LintConfig);
const bin = join(root, RepositoryPath.HomeBin);
const failures: string[] = [];
const temporary = await mkdtemp(join(tmpdir(), "dots-lint-bins-"));

const commands: string[] = [];
for await (const name of new Bun.Glob(FilePattern.Any).scan({ cwd: bin, onlyFiles: true })) {
  commands.push(name);
}

try {
  await Promise.all(
    commands.toSorted().map(async (name) => {
      const source = join(bin, name);
      const lintable = join(temporary, `${name}.ts`);
      await Bun.write(lintable, Bun.file(source));
      const child = Bun.spawn([oxlint, CliFlag.Config, config, CliFlag.DenyWarnings, lintable], {
        cwd: root,
        stdout: StreamMode.Pipe,
        stderr: StreamMode.Pipe,
      });
      const [code, output, diagnostics] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      if (code !== 0) {
        failures.push(name);
        if (output.trim()) console.error(output.trimEnd());
        if (diagnostics.trim()) console.error(diagnostics.trimEnd());
      }
    }),
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(`Bun command lint failed: ${failures.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`Checked ${commands.length} extensionless Bun commands`);
}
