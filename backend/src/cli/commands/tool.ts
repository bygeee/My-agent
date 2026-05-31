import { parseOrThrow } from "../../lib/http.js";
import { toolRunRequestSchema } from "../../types/tool.js";
import { listTools, runTool } from "../../services/tools.js";
import type { ParsedArgs } from "../types.js";
import { CliError } from "../types.js";
import { assignFlag, flagBool, flagString, requirePositional } from "../args.js";
import { printJson, printTable } from "../output.js";

export async function runToolCommand(parsed: ParsedArgs, user: string) {
  const [, action] = parsed.positionals;
  switch (action) {
    case "list": {
      const result = listTools();
      if (flagBool(parsed, "json")) {
        printJson(result);
      } else {
        printTable(result.tools, [
          { key: "name", header: "name", max: 24 },
          { key: "description", header: "description", max: 46 },
          { key: "risk", header: "risk", max: 10 },
          { key: "requires_scope", header: "scope", max: 8 },
          { key: "timeout", header: "timeout", max: 8 }
        ]);
      }
      return;
    }
    case "run": {
      const tool = requirePositional(parsed, 2, "tool run requires a tool name");
      const body: Record<string, unknown> = {
        tool,
        args: parsed.passthrough.length > 0 ? parsed.passthrough : parsed.positionals.slice(3)
      };
      assignFlag(body, "mode", flagString(parsed, "mode"));
      assignFlag(body, "target", flagString(parsed, "target"));
      assignFlag(body, "artifact_path", flagString(parsed, "artifact-path") ?? flagString(parsed, "artifact"));
      const input = parseInputFlag(flagString(parsed, "input"));
      if (input !== undefined) {
        body.input = input;
      }
      const req = parseOrThrow(toolRunRequestSchema, body);
      const result = await runTool(req, user);
      if (flagBool(parsed, "json") || !result.output) {
        printJson(result);
      } else {
        if (!result.allowed) {
          printJson(result);
          return;
        }
        process.stdout.write(result.output);
        if (!result.output.endsWith("\n")) {
          process.stdout.write("\n");
        }
      }
      return;
    }
    default:
      throw new CliError("tool command must be one of: list, run");
  }
}

function parseInputFlag(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("input must be a JSON object");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    const loose = parseLooseObject(value);
    if (loose) {
      return loose;
    }
    throw new CliError(error instanceof Error ? `invalid --input: ${error.message}` : "invalid --input");
  }
}

function parseLooseObject(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return null;
  }
  const body = trimmed.slice(1, -1).trim();
  if (!body) {
    return {};
  }
  const result: Record<string, unknown> = {};
  for (const part of body.split(",")) {
    const separator = part.indexOf(":");
    if (separator <= 0) {
      return null;
    }
    const key = part.slice(0, separator).trim().replace(/^["']|["']$/g, "");
    if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(key)) {
      return null;
    }
    result[key] = parseLooseScalar(part.slice(separator + 1).trim());
  }
  return result;
}

function parseLooseScalar(value: string) {
  const unquoted = value.replace(/^["']|["']$/g, "");
  if (/^-?\d+(\.\d+)?$/.test(unquoted)) {
    return Number(unquoted);
  }
  if (unquoted === "true") {
    return true;
  }
  if (unquoted === "false") {
    return false;
  }
  if (unquoted === "null") {
    return null;
  }
  return unquoted;
}
