#!/usr/bin/env node
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npmBin = "npm";
const useShell = process.platform === "win32";

const build = spawnSync(npmBin, ["run", "build", "--workspace", "backend"], {
  cwd: rootDir,
  encoding: "utf8",
  shell: useShell
});

if (build.error) {
  console.error(build.error.message);
  process.exit(1);
}

if (build.status !== 0) {
  if (build.stdout) {
    process.stdout.write(build.stdout);
  }
  if (build.stderr) {
    process.stderr.write(build.stderr);
  }
  process.exit(build.status ?? 1);
}

const cliPath = path.join(rootDir, "backend", "dist", "cli.js");
const run = spawnSync(process.execPath, [cliPath, ...process.argv.slice(2)], {
  cwd: rootDir,
  stdio: "inherit"
});

if (run.error) {
  console.error(run.error.message);
  process.exit(1);
}

process.exit(run.status ?? 1);
