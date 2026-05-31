import path from "node:path";
import { randomUUID } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import { env } from "../lib/env.js";
import { HttpError } from "../lib/http.js";
import { ensureDir, readJsonFile, writeJsonFile } from "../lib/fs.js";
import { PolicyGate } from "../core/policy.js";
import { audit } from "../core/audit.js";
import type { TaskRequest, TaskStatusUpdate } from "../types/task.js";

export type TaskHistoryEntry = {
  ts: string;
  action: string;
  by: string;
  from?: string;
  to?: string;
  comment?: string;
  path?: string;
};

export type TaskCommentEntry = {
  id: string;
  ts: string;
  by: string;
  text: string;
};

export type TaskArtifactEntry = {
  id: string;
  ts: string;
  by: string;
  path: string;
  label: string;
};

export type StoredTask = {
  task_id: string;
  status: string;
  mode: string;
  prompt: string;
  target: string | null;
  owner: string;
  priority: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  created_by: string;
  history: TaskHistoryEntry[];
  comments: TaskCommentEntry[];
  artifacts: TaskArtifactEntry[];
  result: Record<string, unknown> | null;
};

export type TaskListOptions = {
  status?: string;
  mode?: string;
  owner?: string;
  limit?: number | string;
};

export type TaskArtifactInput = {
  path: string;
  label?: string;
};

export function tasksDir() {
  return path.join(env.dataDir, "tasks");
}

export async function loadTask(taskId: string) {
  const filePath = path.join(tasksDir(), `${taskId}.json`);
  try {
    return await readJsonFile<StoredTask>(filePath);
  } catch {
    throw new HttpError(404, "task not found");
  }
}

export async function saveTask(task: StoredTask) {
  await ensureDir(tasksDir());
  await writeJsonFile(path.join(tasksDir(), `${task.task_id}.json`), task);
}

export async function createTask(req: TaskRequest, user: string) {
  const policy = new PolicyGate();

  for (const decision of [policy.checkMode(req.mode), policy.checkText(req.prompt)]) {
    if (!decision.allowed) {
      await audit("task_refused", { user, mode: req.mode, reason: decision.reason });
      throw new HttpError(403, decision.reason);
    }
  }

  const task = buildTaskRecord(req, user);
  await saveTask(task);
  await audit("task_created", { user, task_id: task.task_id, mode: req.mode, target: req.target ?? null });
  return task;
}

export async function listTasks(options: TaskListOptions = {}) {
  await ensureDir(tasksDir());
  const limit = clampLimit(options.limit);
  const entries = await readdir(tasksDir(), { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json"));

  const detailed = await Promise.all(
    files.map(async (entry) => {
      const filePath = path.join(tasksDir(), entry.name);
      const fileStat = await stat(filePath);
      return { filePath, mtime: fileStat.mtimeMs };
    })
  );

  const sorted = detailed.sort((a, b) => b.mtime - a.mtime);
  const results: Array<Record<string, unknown>> = [];

  for (const file of sorted) {
    if (results.length >= limit) {
      break;
    }
    try {
      const task = await readJsonFile<Record<string, unknown>>(file.filePath);
      if (options.status && task.status !== options.status) {
        continue;
      }
      if (options.mode && task.mode !== options.mode) {
        continue;
      }
      if (options.owner && task.owner !== options.owner) {
        continue;
      }
      results.push({
        task_id: task.task_id,
        status: task.status ?? "unknown",
        mode: task.mode,
        owner: task.owner,
        priority: task.priority ?? "medium",
        prompt: typeof task.prompt === "string" ? task.prompt.slice(0, 120) : "",
        created_at: task.created_at,
        updated_at: task.updated_at
      });
    } catch {
      continue;
    }
  }

  return { tasks: results, total: results.length };
}

export async function updateTaskStatus(taskId: string, req: TaskStatusUpdate, user: string) {
  const task = await loadTask(taskId);
  const now = nowIso();
  const oldStatus = task.status;
  task.status = req.status;
  task.updated_at = now;
  const entry: TaskHistoryEntry = {
    ts: now,
    action: "status_change",
    by: user,
    from: oldStatus,
    to: req.status
  };
  if (req.comment) {
    entry.comment = req.comment;
  }
  task.history.push(entry);
  await saveTask(task);
  await audit("task_status_changed", { user, task_id: taskId, from: oldStatus, to: req.status });
  return task;
}

export async function addTaskComment(taskId: string, text: string, user: string) {
  const task = await loadTask(taskId);
  const now = nowIso();
  const comment = { id: randomUUID(), ts: now, by: user, text };
  task.comments.push(comment);
  task.updated_at = now;
  task.history.push({ ts: now, action: "comment_added", by: user });
  await saveTask(task);
  await audit("task_comment", { user, task_id: taskId, comment_id: comment.id });
  return comment;
}

export async function addTaskArtifact(taskId: string, input: TaskArtifactInput, user: string) {
  const task = await loadTask(taskId);
  const now = nowIso();
  const safePath = path.basename(input.path);
  if (!safePath) {
    throw new HttpError(422, "path is required");
  }
  const artifact = {
    id: randomUUID(),
    ts: now,
    by: user,
    path: safePath,
    label: input.label ?? ""
  };
  task.artifacts.push(artifact);
  task.updated_at = now;
  task.history.push({ ts: now, action: "artifact_added", by: user, path: safePath });
  await saveTask(task);
  await audit("task_artifact", { user, task_id: taskId, artifact_id: artifact.id, path: safePath });
  return artifact;
}

export async function cancelTask(taskId: string, user: string) {
  const task = await loadTask(taskId);
  if (task.status === "completed" || task.status === "failed") {
    throw new HttpError(409, "cannot cancel a finished task");
  }
  const now = nowIso();
  task.status = "failed";
  task.updated_at = now;
  task.history.push({ ts: now, action: "cancelled", by: user });
  await saveTask(task);
  await audit("task_cancelled", { user, task_id: taskId });
  return { task_id: taskId, status: "failed" };
}

function buildTaskRecord(req: TaskRequest, user: string) {
  const now = nowIso();
  const taskId = randomUUID();
  return {
    task_id: taskId,
    status: "pending",
    mode: req.mode,
    prompt: req.prompt,
    target: req.target ?? null,
    owner: req.owner ?? user,
    priority: req.priority,
    tags: req.tags,
    created_at: now,
    updated_at: now,
    created_by: user,
    history: [{ ts: now, action: "created", by: user }],
    comments: [],
    artifacts: [],
    result: null
  } satisfies StoredTask;
}

function nowIso() {
  return new Date().toISOString();
}

function clampLimit(limit: number | string | undefined) {
  const parsed = typeof limit === "number" ? limit : Number.parseInt(limit ?? "50", 10);
  if (Number.isNaN(parsed)) {
    return 50;
  }
  return Math.min(200, Math.max(1, parsed));
}
