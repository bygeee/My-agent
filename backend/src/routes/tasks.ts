import type { AppInstance } from "../server.js";
import { HttpError, parseOrThrow } from "../lib/http.js";
import { requireToken } from "../core/auth.js";
import { taskCommentSchema, taskRequestSchema, taskStatusUpdateSchema } from "../types/task.js";
import {
  addTaskArtifact,
  addTaskComment,
  cancelTask,
  createTask,
  listTasks,
  loadTask,
  updateTaskStatus
} from "../services/tasks.js";

export function registerTaskRoutes(app: AppInstance) {
  app.post("/tasks", async (request) => {
    const user = requireToken(request);
    const req = parseOrThrow(taskRequestSchema, request.body);
    return createTask(req, user);
  });

  app.get("/tasks", async (request) => {
    requireToken(request);
    const query = request.query as Record<string, string | undefined>;
    return listTasks({ status: query.status, mode: query.mode, owner: query.owner, limit: query.limit });
  });

  app.get("/tasks/:taskId", async (request) => {
    requireToken(request);
    const { taskId } = request.params as { taskId: string };
    return loadTask(taskId);
  });

  app.patch("/tasks/:taskId/status", async (request) => {
    const user = requireToken(request);
    const { taskId } = request.params as { taskId: string };
    const req = parseOrThrow(taskStatusUpdateSchema, request.body);
    return updateTaskStatus(taskId, req, user);
  });

  app.post("/tasks/:taskId/comments", async (request) => {
    const user = requireToken(request);
    const { taskId } = request.params as { taskId: string };
    const req = parseOrThrow(taskCommentSchema, request.body);
    return addTaskComment(taskId, req.text, user);
  });

  app.post("/tasks/:taskId/artifacts", async (request) => {
    const user = requireToken(request);
    const { taskId } = request.params as { taskId: string };
    const query = request.query as Record<string, string | undefined>;
    const rawPath = query.path;
    if (!rawPath) {
      throw new HttpError(422, "path is required");
    }
    return addTaskArtifact(taskId, { path: rawPath, label: query.label }, user);
  });

  app.post("/tasks/:taskId/cancel", async (request) => {
    const user = requireToken(request);
    const { taskId } = request.params as { taskId: string };
    return cancelTask(taskId, user);
  });
}
