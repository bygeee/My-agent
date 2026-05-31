import { createInterface } from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import { parseOrThrow } from "../../lib/http.js";
import { taskRequestSchema } from "../../types/task.js";
import {
  addTaskComment,
  createTask,
  loadTask,
  type StoredTask
} from "../../services/tasks.js";
import { replyToTask } from "../../services/assistant.js";
import type { ParsedArgs } from "../types.js";
import { flagArray, flagBool, flagString } from "../args.js";
import { runSlashCommand } from "../repl/slash.js";
import type { ReplState } from "../repl/types.js";


export async function runReplCommand(parsed: ParsedArgs, user: string) {
  const task = await resolveTask(parsed, user);
  const state: ReplState = { task, user, verbose: !flagBool(parsed, "quiet") };
  const rl = createInterface({
    input,
    output,
    terminal: Boolean(input.isTTY && output.isTTY)
  });

  let sigintCount = 0;
  rl.on("SIGINT", () => {
    sigintCount += 1;
    if (sigintCount >= 2) {
      output.write("\nbye\n");
      rl.close();
      return;
    }
    output.write("\npress Ctrl+C again to quit, or type /exit\n");
    rl.prompt();
    setTimeout(() => {
      sigintCount = 0;
    }, 1200).unref();
  });

  printSessionHeader(state);
  rl.setPrompt(promptFor(state.task));
  rl.prompt();

  try {
    for await (const rawLine of rl) {
      const line = rawLine.trim();
      if (!line) {
        rl.prompt();
        continue;
      }
      if (line.startsWith("/")) {
        const shouldExit = await runSlashCommand(line, state, output);
        if (shouldExit) {
          rl.close();
          break;
        }
        rl.setPrompt(promptFor(state.task));
        rl.prompt();
        continue;
      }

      const comment = await addTaskComment(state.task.task_id, line, state.user);
      state.task = await loadTask(state.task.task_id);
      output.write(`saved comment ${comment.id}\n`);
      output.write("assistant: thinking...\n");
      try {
        const reply = await replyToTask(state.task.task_id, line, state.verbose ? buildVerboseObserver() : {});
        state.task = await loadTask(state.task.task_id);
        output.write(`assistant (${reply.model}):\n${reply.text}\n`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        output.write(`assistant error: ${message}\n`);
      }
      rl.setPrompt(promptFor(state.task));
      rl.prompt();
    }
  } finally {
    rl.close();
  }
}

async function resolveTask(parsed: ParsedArgs, user: string) {
  const taskId = flagString(parsed, "task") ?? flagString(parsed, "task-id");
  if (taskId) {
    return loadTask(taskId);
  }

  const prompt = (flagString(parsed, "prompt") ?? parsed.positionals.slice(1).join(" ").trim()) || "Interactive CLI session";

  const body: Record<string, unknown> = { prompt };
  const mode = flagString(parsed, "mode");
  const target = flagString(parsed, "target");
  const owner = flagString(parsed, "owner");
  const priority = flagString(parsed, "priority");
  if (mode) {
    body.mode = mode;
  }
  if (target) {
    body.target = target;
  }
  if (owner) {
    body.owner = owner;
  }
  if (priority) {
    body.priority = priority;
  }
  const tags = collectTags(parsed);
  if (prompt === "Interactive CLI session" && !tags.includes("interactive")) {
    tags.push("interactive");
  }
  if (tags.length > 0) {
    body.tags = tags;
  }
  return createTask(parseOrThrow(taskRequestSchema, body), user);
}

function collectTags(parsed: ParsedArgs) {
  const tags = [...flagArray(parsed, "tag")];
  const tagsCsv = flagString(parsed, "tags");
  if (tagsCsv) {
    tags.push(...tagsCsv.split(",").map((tag) => tag.trim()).filter(Boolean));
  }
  return tags;
}

function promptFor(task: StoredTask) {
  return `ctf-agent:${task.task_id.slice(0, 8)}> `;
}

function printSessionHeader(state: ReplState) {
  output.write("ctf-agent chat\n");
  output.write(`task: ${state.task.task_id} (${state.task.status})\n`);
  output.write(`mode: ${state.task.mode} | priority: ${state.task.priority}\n`);
  output.write(`prompt: ${clip(state.task.prompt.replace(/\s+/g, " "), 120)}\n`);
  output.write(`verbose: ${state.verbose ? "on" : "off"} | type /help for commands, /exit to quit\n\n`);
}

function buildVerboseObserver() {
  return {
    onRequest: (requestInput: unknown) => {
      output.write(`[responses.request] ${formatRequestInput(requestInput)}\n`);
    },
    onToolCall: (_call: unknown, toolInput: { tool: string; mode: string; target?: string; artifact_path?: string; args: string[] }) => {
      output.write(`[tool.call] ${toolInput.tool} ${JSON.stringify({
        mode: toolInput.mode,
        target: toolInput.target,
        artifact_path: toolInput.artifact_path,
        args: toolInput.args
      })}\n`);
    },
    onToolResult: (trace: { tool: string; output: { allowed: boolean; exit_code?: number | null; summary?: string; error_code?: string; error?: string; output?: string; truncated?: boolean } }) => {
      output.write(`[tool.result] ${trace.tool} ${JSON.stringify({
        allowed: trace.output.allowed,
        exit_code: trace.output.exit_code,
        summary: trace.output.summary,
        error_code: trace.output.error_code,
        error: trace.output.error,
        truncated: trace.output.truncated
      })}\n`);
      if (trace.output.output) {
        output.write(`${clip(trace.output.output, 4000)}\n`);
      }
    }
  };
}

function formatRequestInput(requestInput: unknown) {
  if (typeof requestInput === "string") {
    return clip(requestInput.replace(/\s+/g, " "), 300);
  }
  return clip(JSON.stringify(requestInput), 500);
}

function clip(text: string, max: number) {
  return text.length <= max ? text : `${text.slice(0, max)}...`;
}
