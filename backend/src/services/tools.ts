import { audit } from "../core/audit.js";
import { ToolRegistry } from "../tools/registry.js";
import { ToolDispatcher } from "../tools/dispatcher.js";
import type { ToolRunRequest } from "../types/tool.js";

export function listTools() {
  return { tools: new ToolRegistry().list() };
}

export async function runTool(req: ToolRunRequest, user: string) {
  const result = new ToolDispatcher().run(req);
  await audit("tool_run", {
    user,
    tool: req.tool,
    target: req.target ?? null,
    result: Object.fromEntries(Object.entries(result).filter(([key]) => key !== "output"))
  });
  return result;
}
