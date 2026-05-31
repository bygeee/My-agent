#!/usr/bin/env bun
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const useShell = process.platform === "win32";
const cliPath = path.join(rootDir, "backend", "src", "cli.ts");
const run = spawnSync("bun", ["run", cliPath, ...process.argv.slice(2)], {
  cwd: rootDir,
  stdio: "inherit",
  shell: useShell
});

if (run.error) {
  console.error(run.error.message);
  process.exit(1);
}

process.exit(run.status ?? 1);
