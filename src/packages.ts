export * from "./packages/install";

import { installPackages, platformFromEnvironment } from "./packages/install";

if (import.meta.main) {
  const dryRun = process.argv.includes("--dry-run") || process.argv.includes("--plan");
  installPackages({ platform: platformFromEnvironment(), dryRun })
    .then((report) => {
      if (dryRun) {
        for (const line of report.planned) console.log(line);
      }
      if (report.failures.length > 0) process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
