import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const oxfmt = join(root, "node_modules/.bin/oxfmt");
const bin = join(root, "home/.local/bin");
const write = Bun.argv.includes("--write");
const failures: string[] = [];
const commands: string[] = [];

for await (const name of new Bun.Glob("*").scan({ cwd: bin, onlyFiles: true })) {
  commands.push(name);
}

await Promise.all(
  commands.toSorted().map(async (name) => {
    const path = join(bin, name);
    const source = await Bun.file(path).text();
    const child = Bun.spawn([oxfmt, "--stdin-filepath", `${path}.ts`], {
      cwd: root,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
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
