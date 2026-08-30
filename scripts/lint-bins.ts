import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const biome = join(root, "node_modules/.bin/biome");
const bin = join(root, "home/.local/bin");
const failures: string[] = [];

const commands: string[] = [];
for await (const name of new Bun.Glob("*").scan({ cwd: bin, onlyFiles: true })) {
  commands.push(name);
}

await Promise.all(
  commands.sort().map(async (name) => {
    const path = join(bin, name);
    const source = await Bun.file(path).text();
    const child = Bun.spawn(
      [biome, "lint", "--write", "--stdin-file-path", `${path}.js`, "--max-diagnostics=100"],
      { cwd: root, stdin: "pipe", stdout: "pipe", stderr: "pipe" },
    );
    child.stdin.write(source);
    child.stdin.end();
    const [code, fixed, diagnostics] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    if (code !== 0 || fixed !== source) {
      failures.push(name);
      if (diagnostics.trim()) console.error(diagnostics.trimEnd());
      if (fixed !== source) console.error(`${name}: fixable lint changes are required`);
    }
  }),
);

if (failures.length > 0) {
  console.error(`Bun command lint failed: ${failures.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`Checked ${commands.length} extensionless Bun commands`);
}
