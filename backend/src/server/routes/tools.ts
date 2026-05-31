import type { AppInstance } from "../../server.js";
import { requireToken } from "../../core/auth.js";
import { parseOrThrow } from "../../lib/http.js";
import { toolRunRequestSchema } from "../../types/tool.js";
import { listTools, runTool } from "../../services/tools.js";

export function registerToolRoutes(app: AppInstance) {
  app.get("/tools", async (request) => {
    requireToken(request);
    return listTools();
  });

  app.post("/tools/run", async (request) => {
    const user = requireToken(request);
    const req = parseOrThrow(toolRunRequestSchema, request.body);
    return runTool(req, user);
  });
}
