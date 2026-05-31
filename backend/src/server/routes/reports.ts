import type { AppInstance } from "../../server.js";
import { requireToken } from "../../core/auth.js";
import { readTaskReport } from "../../services/reports.js";

export function registerReportRoutes(app: AppInstance) {
  app.get("/reports/:taskId", async (request, reply) => {
    requireToken(request);
    const { taskId } = request.params as { taskId: string };
    const content = await readTaskReport(taskId);
    reply.type("application/json");
    return content;
  });
}
