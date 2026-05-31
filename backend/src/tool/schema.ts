import type { ToolDefinition, ToolManifest, ToolPermission, ToolRisk } from "./definition.js";

const validRisks = new Set<ToolRisk>(["low", "medium", "high"]);
const validPermissions = new Set<ToolPermission>([
  "filesystem:read",
  "filesystem:write",
  "process:spawn",
  "network:targeted",
  "state:read",
  "state:write",
  "mcp:read",
  "mcp:write"
]);

export function buildToolDefinition(id: string, manifest: Partial<ToolManifest>): ToolDefinition {
  const command = normalizeStringArray(manifest.command, "command");
  if (command.length === 0) {
    throw new Error(`tool ${id} command must not be empty`);
  }

  const risk = normalizeRisk(manifest.risk);
  const permissions = normalizePermissions(manifest.permissions);
  const timeout = normalizePositiveNumber(manifest.timeout, 30, "timeout");
  const maxArgs = normalizePositiveNumber(manifest.max_args, 8, "max_args");
  const maxArgLength = normalizePositiveNumber(manifest.max_arg_length, 500, "max_arg_length");

  const definition: ToolDefinition = {
    id,
    description: normalizeDescription(id, manifest.description),
    command,
    risk,
    permissions,
    requires_scope: Boolean(manifest.requires_scope),
    timeout,
    max_args: maxArgs,
    max_arg_length: maxArgLength,
    output_limit: normalizePositiveNumber(manifest.output_limit, 20000, "output_limit"),
    inputSchema: buildConfiguredToolInputSchema(command, Boolean(manifest.requires_scope), maxArgs, maxArgLength)
  };

  if (manifest.source !== undefined) {
    definition.source = manifest.source;
  }
  return definition;
}

function buildConfiguredToolInputSchema(command: string[], requiresScope: boolean, maxArgs: number, maxArgLength: number) {
  const builtin = command[0];
  if (builtin === "builtin:http_get" || builtin === "builtin:http_head") {
    return buildHttpInputSchema(builtin, maxArgs, maxArgLength);
  }
  return {
    type: "object",
    required: requiresScope ? ["mode", "target", "args"] : ["mode", "args"],
    additionalProperties: false,
    properties: {
      mode: { type: "string" },
      target: { type: "string" },
      artifact_path: { type: "string" },
      args: {
        type: "array",
        maxItems: maxArgs,
        items: { type: "string", maxLength: maxArgLength }
      }
    }
  } satisfies ToolDefinition["inputSchema"];
}

function buildHttpInputSchema(builtin: string, maxArgs: number, maxArgLength: number) {
  return {
    type: "object",
    required: ["mode", "target"],
    additionalProperties: false,
    properties: {
      mode: { type: "string" },
      target: { type: "string" },
      args: {
        type: "array",
        description: "Optional same-origin path as the first item.",
        maxItems: maxArgs,
        items: { type: "string", maxLength: maxArgLength }
      },
      headers: {
        type: "object",
        additionalProperties: { type: "string" },
        properties: {}
      },
    }
  } satisfies ToolDefinition["inputSchema"];
}

function normalizeDescription(id: string, value: unknown) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return `${id} command tool`;
}

function normalizeRisk(value: unknown): ToolRisk {
  if (typeof value === "string" && validRisks.has(value as ToolRisk)) {
    return value as ToolRisk;
  }
  return "low";
}

function normalizePermissions(value: unknown): ToolPermission[] {
  const permissions = normalizeStringArray(value, "permissions")
    .filter((item): item is ToolPermission => validPermissions.has(item as ToolPermission));
  return permissions.length > 0 ? permissions : ["process:spawn"];
}

function normalizeStringArray(value: unknown, field: string) {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array`);
  }
  return value.map((item) => {
    if (typeof item !== "string" || !item.trim()) {
      throw new Error(`${field} must contain non-empty strings`);
    }
    return item.trim();
  });
}

function normalizePositiveNumber(value: unknown, fallback: number, field: string) {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${field} must be a positive number`);
  }
  return Math.floor(value);
}
