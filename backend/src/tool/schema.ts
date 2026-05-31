import type { ToolDefinition, ToolManifest, ToolPermission, ToolRisk } from "./definition.js";

const validRisks = new Set<ToolRisk>(["low", "medium", "high"]);
const validPermissions = new Set<ToolPermission>([
  "filesystem:read",
  "filesystem:write",
  "process:spawn",
  "network:targeted"
]);

export function buildToolDefinition(id: string, manifest: Partial<ToolManifest>): ToolDefinition {
  const command = normalizeStringArray(manifest.command, "command");
  if (command.length === 0) {
    throw new Error(`tool ${id} command must not be empty`);
  }

  const risk = normalizeRisk(manifest.risk);
  const permissions = normalizePermissions(manifest.permissions);

  return {
    id,
    description: normalizeDescription(id, manifest.description),
    command,
    risk,
    permissions,
    requires_scope: Boolean(manifest.requires_scope),
    timeout: normalizePositiveNumber(manifest.timeout, 30, "timeout"),
    max_args: normalizePositiveNumber(manifest.max_args, 8, "max_args"),
    max_arg_length: normalizePositiveNumber(manifest.max_arg_length, 500, "max_arg_length"),
    output_limit: normalizePositiveNumber(manifest.output_limit, 20000, "output_limit"),
    inputSchema: {
      type: "object",
      required: ["tool", "mode", "args"],
      additionalProperties: false,
      properties: {
        tool: { type: "string", const: id },
        mode: { type: "string" },
        target: { type: "string" },
        artifact_path: { type: "string" },
        args: {
          type: "array",
          maxItems: manifest.max_args ?? 8,
          items: { type: "string", maxLength: manifest.max_arg_length ?? 500 }
        }
      }
    }
  };
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
