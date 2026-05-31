import path from "node:path";
import { existsSync, readFileSync } from "node:fs";

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
const defaultRuntimeDir = "D:/test-agent";
loadLocalEnv(repoDir);

export const env = {
  baseDir: resolveEnvPath(process.env.Z3GH0NE_BASE_DIR, repoDir),
  configDir: resolveEnvPath(process.env.Z3GH0NE_CONFIG_DIR, path.join(repoDir, "config")),
  dataDir: resolveEnvPath(process.env.Z3GH0NE_DATA_DIR, defaultRuntimeDir),
  logDir: resolveEnvPath(process.env.Z3GH0NE_LOG_DIR, path.join(defaultRuntimeDir, "logs")),
  model: process.env.Z3GH0NE_MODEL ?? "claude-opus-4-6",
  llmMode: process.env.Z3GH0NE_LLM_MODE ?? "external_local_cc",
  adminUser: process.env.Z3GH0NE_ADMIN_USER ?? "agent",
  adminPassword: process.env.Z3GH0NE_ADMIN_PASSWORD ?? "",
  adminToken: process.env.Z3GH0NE_ADMIN_TOKEN ?? "",
  localAgentUser: process.env.Z3GH0NE_LOCAL_AGENT_USER ?? "local-agent",
  localAgentToken: process.env.Z3GH0NE_LOCAL_AGENT_TOKEN ?? "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  openaiApiUrl: process.env.Z3GH0NE_OPENAI_API_URL
    ?? process.env.Z3GH0NE_OPENAI_BASE_URL
    ?? process.env.OPENAI_BASE_URL
    ?? "https://api.psydo.top",
  openaiApiKey: process.env.Z3GH0NE_OPENAI_API_KEY
    ?? process.env.Z3GH0NE_OPENAI_KEY
    ?? process.env.OPENAI_API_KEY
    ?? "",
  openaiModel: process.env.Z3GH0NE_OPENAI_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-5.5",
  openaiReasoningEffort: process.env.Z3GH0NE_OPENAI_REASONING_EFFORT
    ?? process.env.OPENAI_REASONING_EFFORT
    ?? "xhigh",
  port: Number.parseInt(process.env.PORT ?? "8080", 10),
  uploadsDir: resolveEnvPath(process.env.Z3GH0NE_UPLOADS_DIR, path.join(defaultRuntimeDir, "uploads")),
  workspacesDir: resolveEnvPath(process.env.Z3GH0NE_WORKSPACES_DIR, path.join(defaultRuntimeDir, "workspaces"))
};

function loadLocalEnv(rootDir: string) {
  for (const fileName of [".env.local", ".env"]) {
    const filePath = path.join(rootDir, fileName);
    if (!existsSync(filePath)) {
      continue;
    }
    const content = readFileSync(filePath, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }
      const equalsIndex = line.indexOf("=");
      if (equalsIndex <= 0) {
        continue;
      }
      const key = line.slice(0, equalsIndex).trim();
      const value = line.slice(equalsIndex + 1).trim().replace(/^["']|["']$/g, "");
      process.env[key] ??= value;
    }
  }
}
