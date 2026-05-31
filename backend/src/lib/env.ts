import path from "node:path";
import { existsSync } from "node:fs";

function resolveEnvPath(value: string | undefined, fallback: string) {
  return path.resolve(value ?? fallback);
}

function findRepoDir() {
  const cwd = process.cwd();
  if (existsSync(path.join(cwd, "backend", "package.json")) && existsSync(path.join(cwd, "config"))) {
    return cwd;
  }
  const parent = path.resolve(cwd, "..");
  if (existsSync(path.join(parent, "backend", "package.json")) && existsSync(path.join(parent, "config"))) {
    return parent;
  }
  return cwd;
}

const repoDir = findRepoDir();
const backendDir = existsSync(path.join(repoDir, "backend", "package.json")) ? path.join(repoDir, "backend") : repoDir;

export const env = {
  baseDir: resolveEnvPath(process.env.Z3GH0NE_BASE_DIR, repoDir),
  configDir: resolveEnvPath(process.env.Z3GH0NE_CONFIG_DIR, path.join(repoDir, "config")),
  dataDir: resolveEnvPath(process.env.Z3GH0NE_DATA_DIR, path.join(backendDir, ".runtime-data")),
  logDir: resolveEnvPath(process.env.Z3GH0NE_LOG_DIR, path.join(backendDir, ".runtime-logs")),
  model: process.env.Z3GH0NE_MODEL ?? "claude-opus-4-6",
  llmMode: process.env.Z3GH0NE_LLM_MODE ?? "external_local_cc",
  adminUser: process.env.Z3GH0NE_ADMIN_USER ?? "agent",
  adminPassword: process.env.Z3GH0NE_ADMIN_PASSWORD ?? "",
  adminToken: process.env.Z3GH0NE_ADMIN_TOKEN ?? "",
  localAgentUser: process.env.Z3GH0NE_LOCAL_AGENT_USER ?? "local-agent",
  localAgentToken: process.env.Z3GH0NE_LOCAL_AGENT_TOKEN ?? "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  port: Number.parseInt(process.env.PORT ?? "8080", 10),
  uploadsDir: resolveEnvPath(process.env.Z3GH0NE_UPLOADS_DIR, path.join(backendDir, ".runtime-data", "uploads")),
  workspacesDir: resolveEnvPath(process.env.Z3GH0NE_WORKSPACES_DIR, path.join(backendDir, ".runtime-data", "workspaces"))
};
