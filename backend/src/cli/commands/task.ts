import { parseOrThrow } from "../../lib/http.js";
import { taskCommentSchema, taskRequestSchema, taskStatusUpdateSchema } from "../../types/task.js";
import {
  addTaskArtifact,
  addTaskComment,
  cancelTask,
  createTask,
  listTasks,
  loadTask,
  updateTaskStatus
} from "../../services/tasks.js";
import type { ParsedArgs } from "../types.js";
import { CliError } from "../types.js";
import { assignFlag, flagArray, flagBool, flagString, requirePositional } from "../args.js";
import { printJson, printTable } from "../output.js";

export async function runTaskCommand(parsed: ParsedArgs, user: string) {
  const [, action] = parsed.positionals;
  switch (action) {
    case "create": {
      const prompt = flagString(parsed, "prompt") ?? parsed.positionals.slice(2).join(" ").trim();
      if (!prompt) {
        throw new CliError("task create requires --prompt or prompt text");
      }
      const body: Record<string, unknown> = { prompt };
      assignFlag(body, "mode", flagString(parsed, "mode"));
      assignFlag(body, "target", flagString(parsed, "target"));
      assignFlag(body, "owner", flagString(parsed, "owner"));
      assignFlag(body, "priority", flagString(parsed, "priority"));
      const tags = collectTags(parsed);
      if (tags.length > 0) {
        body.tags = tags;
      }
      const req = parseOrThrow(taskRequestSchema, body);
      printJson(await createTask(req, user));
      return;
    }
    case "list": {
      const result = await listTasks({
        status: flagString(parsed, "status"),
        mode: flagString(parsed, "mode"),
        owner: flagString(parsed, "owner"),
        limit: flagString(parsed, "limit")
      });
      if (flagBool(parsed, "json")) {
        printJson(result);
      } else {
        printTable(result.tasks, [
          { key: "task_id", header: "task_id", max: 36 },
          { key: "status", header: "status", max: 16 },
          { key: "mode", header: "mode", max: 28 },
          { key: "priority", header: "priority", max: 10 },
          { key: "owner", header: "owner", max: 18 },
          { key: "prompt", header: "prompt", max: 60 }
        ]);
      }
      return;
    }
    case "show": {
      const taskId = requirePositional(parsed, 2, "task show requires a task id");
      printJson(await loadTask(taskId));
      return;
    }
    case "status": {
      const taskId = requirePositional(parsed, 2, "task status requires a task id");
      const status = requirePositional(parsed, 3, "task status requires a status value");
      const body: Record<string, unknown> = { status };
      assignFlag(body, "comment", flagString(parsed, "comment"));
      const req = parseOrThrow(taskStatusUpdateSchema, body);
      printJson(await updateTaskStatus(taskId, req, user));
      return;
    }
    case "comment": {
      const taskId = requirePositional(parsed, 2, "task comment requires a task id");
      const text = flagString(parsed, "text") ?? parsed.positionals.slice(3).join(" ").trim();
      const req = parseOrThrow(taskCommentSchema, { text });
      printJson(await addTaskComment(taskId, req.text, user));
      return;
    }
    case "artifact": {
      const taskId = requirePositional(parsed, 2, "task artifact requires a task id");
      const artifactPath = flagString(parsed, "path");
      if (!artifactPath) {
        throw new CliError("task artifact requires --path");
      }
      printJson(await addTaskArtifact(taskId, { path: artifactPath, label: flagString(parsed, "label") }, user));
      return;
    }
    case "cancel": {
      const taskId = requirePositional(parsed, 2, "task cancel requires a task id");
      printJson(await cancelTask(taskId, user));
      return;
    }
    default:
      throw new CliError("task command must be one of: create, list, show, status, comment, artifact, cancel");
  }
}

function collectTags(parsed: ParsedArgs) {
  const tags = [...flagArray(parsed, "tag")];
  const tagsCsv = flagString(parsed, "tags");
  if (tagsCsv) {
    tags.push(...tagsCsv.split(",").map((tag) => tag.trim()).filter(Boolean));
  }
  return tags;
}
