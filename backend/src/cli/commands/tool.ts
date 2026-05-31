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
