import { readFileSync } from "node:fs";
import path from "node:path";
import { env } from "../lib/env.js";
import { parseToolRegistryYaml } from "../lib/yaml.js";
import type { ToolDefinition, ToolRegistryConfig } from "./definition.js";
import { buildToolDefinition } from "./schema.js";

export class ToolRegistry {
  private readonly tools: Record<string, ToolDefinition>;

  constructor(configPath = defaultToolConfigPath()) {
    const raw = parseToolRegistryYaml(readFileSync(configPath, "utf8")) as ToolRegistryConfig;
    this.tools = Object.fromEntries(
      Object.entries(raw.tools ?? {}).map(([id, manifest]) => [id, buildToolDefinition(id, manifest)])
    );
  }

  list() {
    return Object.entries(this.tools).map(([name, meta]) => ({
      name,
      description: meta.description,
      risk: meta.risk,
      permissions: meta.permissions,
      requires_scope: meta.requires_scope,
      timeout: meta.timeout,
      max_args: meta.max_args,
      output_limit: meta.output_limit
    }));
  }

  get(name: string) {
    return this.tools[name];
  }
}

function defaultToolConfigPath() {
  return path.join(env.configDir, "tools.yaml");
}
