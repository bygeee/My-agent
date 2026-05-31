import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { env } from "../lib/env.js";
import { parseToolRegistryYaml } from "../lib/yaml.js";
import type { ToolDefinition, ToolRegistryConfig } from "./definition.js";
import { getClaudeCodeToolDefinitions } from "./claude.js";
import { buildToolDefinition } from "./schema.js";

const availabilityCache = new Map<string, boolean>();

export class ToolRegistry {
  private readonly tools: Record<string, ToolDefinition>;

  constructor(configPath = defaultToolConfigPath()) {
    const raw = parseToolRegistryYaml(readFileSync(configPath, "utf8")) as ToolRegistryConfig;
    const configuredTools = Object.fromEntries(
      Object.entries(raw.tools ?? {}).map(([id, manifest]) => [id, buildToolDefinition(id, manifest)])
    );
    this.tools = {
      ...getClaudeCodeToolDefinitions(),
      ...configuredTools
    };
  }

  list(options: { availableOnly?: boolean } = {}) {
    const tools = Object.entries(this.tools).map(([name, meta]) => {
      const available = toolAvailable(meta);
      return {
        name,
        description: meta.description,
        risk: meta.risk,
        permissions: meta.permissions,
        requires_scope: meta.requires_scope,
        timeout: meta.timeout,
        max_args: meta.max_args,
        output_limit: meta.output_limit,
        source: meta.source ?? "config",
        input_schema: meta.inputSchema,
        available,
        unavailable_reason: available ? null : unavailableReason(meta)
      };
    });
    return options.availableOnly ? tools.filter((tool) => tool.available) : tools;
  }

  get(name: string) {
    return this.tools[name];
  }
}

function defaultToolConfigPath() {
  return path.join(env.configDir, "tools.yaml");
}

function toolAvailable(tool: ToolDefinition) {
  const binary = tool.command[0];
  if (!binary) {
    return false;
  }
  if (binary.startsWith("builtin:unsupported:")) {
    return false;
  }
  if (binary.startsWith("builtin:")) {
    return true;
  }
  if (!tool.permissions.includes("process:spawn")) {
    return true;
  }
  if (path.isAbsolute(binary) || binary.includes("/") || binary.includes("\\")) {
    return existsSync(binary);
  }
  const cached = availabilityCache.get(binary);
  if (cached !== undefined) {
    return cached;
  }
  const checker = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnSync(checker, [binary], {
    encoding: "utf8",
    stdio: "ignore",
    timeout: 1500
  });
  const available = result.status === 0;
  availabilityCache.set(binary, available);
  return available;
}

function unavailableReason(tool: ToolDefinition) {
  const binary = tool.command[0];
  if (!binary) {
    return "tool command is empty";
  }
  if (binary.startsWith("builtin:unsupported:")) {
    return "registered from bygeee/claude-code; local adapter not implemented yet";
  }
  return `${binary} is not available in PATH`;
}
