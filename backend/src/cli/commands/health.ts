import { env } from "../../lib/env.js";
import { printJson } from "../output.js";

export function runHealthCommand(user: string) {
  printJson({
    ok: true,
    name: "z3gh0ne",
    version: "0.3.0",
    interface: "cli",
    model: env.model,
    llm_mode: env.llmMode,
    user,
    config_dir: env.configDir,
    data_dir: env.dataDir,
    workspaces_dir: env.workspacesDir
  });
}
