import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const tests: string[] = [];

for await (const path of new Bun.Glob("**/*.test.ts").scan({
  cwd: root,
  dot: true,
  onlyFiles: true,
})) {
  if (!path.startsWith(".git/") && !path.startsWith("node_modules/")) tests.push(`./${path}`);
}

const child = Bun.spawn([process.execPath, "test", ...Bun.argv.slice(2), ...tests.toSorted()], {
  cwd: root,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});

process.exit(await child.exited);
