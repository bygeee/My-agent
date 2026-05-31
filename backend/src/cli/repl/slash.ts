import { writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { env } from "../../lib/env.js";
import { parseOrThrow } from "../../lib/http.js";
import { taskRequestSchema, taskStatusUpdateSchema } from "../../types/task.js";
import { addTaskComment, createTask, loadTask, updateTaskStatus, type StoredTask } from "../../services/tasks.js";
import { listTools } from "../../services/tools.js";
import { buildSystemPrompt, listPromptSections } from "../../prompt/system.js";
import { printJson, printTable } from "../output.js";
import type { ReplState, SlashCommand, SlashCommandContext } from "./types.js";

export async function runSlashCommand(line: string, state: ReplState, output: NodeJS.WriteStream) {
  const [rawCommand = "", ...rest] = line.slice(1).split(" ");
  const commandName = rawCommand.trim();
  const args = rest.join(" ").trim();
  const command = findSlashCommand(commandName);
  if (!command) {
    output.write(`unknown command: /${commandName}\n`);
    output.write("type /help for commands\n");
    return false;
  }
  return (await command.run({ state, args, output })) === "exit";
}

function findSlashCommand(name: string) {
  return slashCommands.find((command) => command.name === name || command.aliases?.includes(name));
}

const slashCommands: SlashCommand[] = [
  {
    name: "exit",
    aliases: ["quit", "q"],
    usage: "/exit",
    description: "Quit the chat session.",
    run({ output }) {
      output.write("bye\n");
      return "exit";
    }
  },
  {
    name: "help",
    aliases: ["?"],
    usage: "/help",
    description: "Show available slash commands.",
    run({ output }) {
      printReplHelp(output);
      return "continue";
    }
  },
  {
    name: "id",
    usage: "/id",
    description: "Print the current task id.",
    run({ state, output }) {
      output.write(`${state.task.task_id}\n`);
      return "continue";
    }
  },
  {
    name: "show",
    usage: "/show",
    description: "Show a compact task summary.",
    async run({ state, output }) {
      state.task = await loadTask(state.task.task_id);
      printTaskSummary(state.task, output);
      return "continue" as const;
    }
  },
  {
    name: "new",
    usage: "/new <prompt>",
    description: "Create a new task and switch to it.",
    async run({ state, args, output }) {
      if (!args) {
        output.write("usage: /new <prompt>\n");
        return "continue" as const;
      }
      state.task = await createTask(parseOrThrow(taskRequestSchema, {
        mode: state.task.mode,
        prompt: args,
        priority: state.task.priority,
        tags: state.task.tags
      }), state.user);
      output.write(`switched to new task ${state.task.task_id}\n`);
      return "continue" as const;
    }
  },
  {
    name: "resume",
    aliases: ["switch"],
    usage: "/resume <task_id>",
    description: "Switch to an existing task.",
    async run({ state, args, output }) {
      if (!args) {
        output.write("usage: /resume <task_id>\n");
        return "continue" as const;
      }
      state.task = await loadTask(args);
      output.write(`switched to ${state.task.task_id} (${state.task.status})\n`);
      return "continue" as const;
    }
  },
  {
    name: "json",
    usage: "/json",
    description: "Print the full current task JSON.",
    async run({ state }) {
      state.task = await loadTask(state.task.task_id);
      printJson(state.task);
      return "continue" as const;
    }
  },
  {
    name: "comments",
    usage: "/comments",
    description: "Show task comments.",
    async run({ state, output }) {
      state.task = await loadTask(state.task.task_id);
      printComments(state.task, output);
      return "continue" as const;
    }
  },
  {
    name: "status",
    usage: "/status <pending|running|waiting_approval|completed|failed|blocked> [comment]",
    description: "Update task status.",
    async run(context) {
      await updateStatus(context);
      return "continue" as const;
    }
  },
  {
    name: "comment",
    usage: "/comment <text>",
    description: "Add a comment without sending it to the model.",
    async run({ state, args, output }) {
      if (!args) {
        output.write("usage: /comment <text>\n");
        return "continue" as const;
      }
      await addTaskComment(state.task.task_id, args, state.user);
      state.task = await loadTask(state.task.task_id);
      output.write("saved\n");
      return "continue" as const;
    }
  },
  {
    name: "tools",
    usage: "/tools",
    description: "List registered tools.",
    run() {
      printTable(listTools().tools, [
        { key: "name", header: "name", max: 24 },
        { key: "description", header: "description", max: 46 },
        { key: "risk", header: "risk", max: 10 },
        { key: "requires_scope", header: "scope", max: 8 },
        { key: "timeout", header: "timeout", max: 8 }
      ]);
      return "continue";
    }
  },
  {
    name: "verbose",
    usage: "/verbose [on|off]",
    description: "Toggle request and tool-call logs.",
    run({ state, args, output }) {
      const value = args.trim().toLowerCase();
      if (value === "on") {
        state.verbose = true;
      } else if (value === "off") {
        state.verbose = false;
      } else if (value) {
        output.write("usage: /verbose [on|off]\n");
        return "continue";
      } else {
        state.verbose = !state.verbose;
      }
      output.write(`verbose: ${state.verbose ? "on" : "off"}\n`);
      return "continue";
    }
  },
  {
    name: "clear",
    aliases: ["cls"],
    usage: "/clear",
    description: "Clear the terminal.",
    run({ output }) {
      output.write("\x1Bc");
      return "continue";
    }
  },
  {
    name: "allow",
    usage: "/allow <host>",
    description: "Allow a target host for scoped tools in this process.",
    run({ args, output }) {
      const host = normalizeHost(args);
      if (!host) {
        output.write("usage: /allow <host-or-url>\n");
        return "continue";
      }
      const allowed = getRuntimeAllowedTargets();
      allowed.add(host);
      process.env.Z3GH0NE_ALLOWED_TARGETS = [...allowed].join(",");
      output.write(`allowed target: ${host}\n`);
      return "continue";
    }
  },
  {
    name: "scope",
    usage: "/scope",
    description: "Show runtime allowed targets.",
    run({ output }) {
      const allowed = [...getRuntimeAllowedTargets()];
      output.write(`runtime allowed targets: ${allowed.length ? allowed.join(", ") : "(none)"}\n`);
      return "continue";
    }
  },
  {
    name: "doctor",
    usage: "/doctor",
    description: "Check local provider and tool configuration.",
    run({ output }) {
      const tools = listTools().tools;
      output.write(`config_dir: ${env.configDir} (${existsSync(env.configDir) ? "ok" : "missing"})\n`);
      output.write(`data_dir: ${env.dataDir}\n`);
      output.write(`api_url: ${env.openaiApiUrl}\n`);
      output.write(`model: ${env.openaiModel}\n`);
      output.write(`reasoning: ${env.openaiReasoningEffort}\n`);
      output.write(`key_configured: ${env.openaiApiKey ? "yes" : "no"}\n`);
      output.write(`tools: ${tools.length}\n`);
      output.write(`runtime_scope: ${[...getRuntimeAllowedTargets()].join(", ") || "(none)"}\n`);
      return "continue";
    }
  },
  {
    name: "login",
    usage: "/login [api_url=URL] [key=KEY] [model=MODEL] [reasoning=EFFORT]",
    description: "Update local Responses API settings in .env.local.",
    run({ args, output }) {
      updateLocalEnv(args, output);
      return "continue";
    }
  },
  {
    name: "config",
    usage: "/config",
    description: "Show active provider configuration without secrets.",
    run({ output }) {
      output.write(`api_url: ${env.openaiApiUrl}\n`);
      output.write(`model: ${env.openaiModel}\n`);
      output.write(`reasoning: ${env.openaiReasoningEffort}\n`);
      output.write(`key_configured: ${env.openaiApiKey ? "yes" : "no"}\n`);
      return "continue";
    }
  },
  {
    name: "prompt",
    usage: "/prompt [show|sections]",
    description: "Inspect the active system prompt.",
    run({ state, args, output }) {
      const mode = args.trim() || "sections";
      if (mode === "show") {
        output.write(`${buildSystemPrompt({ task: state.task })}\n`);
        return "continue";
      }
      if (mode === "sections") {
        printTable(listPromptSections(), [
          { key: "id", header: "id", max: 20 },
          { key: "title", header: "title", max: 24 },
          { key: "lines", header: "lines", max: 8 }
        ]);
        return "continue";
      }
      output.write("usage: /prompt [show|sections]\n");
      return "continue";
    }
  }
];

function printReplHelp(output: NodeJS.WriteStream) {
  output.write("Commands:\n");
  for (const command of slashCommands) {
    output.write(`  ${command.usage.padEnd(64)} ${command.description}\n`);
  }
  output.write("\nAny non-command input is saved as a comment and sent to the Responses API.\n");
}

function getRuntimeAllowedTargets() {
  return new Set(
    (process.env.Z3GH0NE_ALLOWED_TARGETS ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function normalizeHost(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  try {
    const withProtocol = trimmed.includes("://") ? trimmed : `http://${trimmed}`;
    return new URL(withProtocol).hostname;
  } catch {
    return trimmed.split("/")[0]?.split(":")[0] ?? "";
  }
}

async function updateStatus({ state, args, output }: SlashCommandContext) {
  const [status, ...commentParts] = args.split(" ").filter(Boolean);
  if (!status) {
    output.write("usage: /status <pending|running|waiting_approval|completed|failed|blocked> [comment]\n");
    return;
  }
  const body: Record<string, unknown> = { status };
  const comment = commentParts.join(" ").trim();
  if (comment) {
    body.comment = comment;
  }
  state.task = await updateTaskStatus(
    state.task.task_id,
    parseOrThrow(taskStatusUpdateSchema, body),
    state.user
  );
  output.write(`status: ${state.task.status}\n`);
}

function printTaskSummary(task: StoredTask, output: NodeJS.WriteStream) {
  output.write(`task_id: ${task.task_id}\n`);
  output.write(`status: ${task.status}\n`);
  output.write(`mode: ${task.mode}\n`);
  output.write(`priority: ${task.priority}\n`);
  output.write(`prompt: ${task.prompt}\n`);
  output.write(`comments: ${task.comments.length}\n`);
  output.write(`artifacts: ${task.artifacts.length}\n`);
}

function printComments(task: StoredTask, output: NodeJS.WriteStream) {
  if (task.comments.length === 0) {
    output.write("(no comments)\n");
    return;
  }
  for (const comment of task.comments) {
    output.write(`[${comment.ts}] ${comment.by}: ${comment.text}\n`);
  }
}

function updateLocalEnv(args: string, output: NodeJS.WriteStream) {
  const updates = parseKeyValueArgs(args);
  if (Object.keys(updates).length === 0) {
    output.write("usage: /login api_url=URL key=KEY model=MODEL reasoning=EFFORT\n");
    output.write("omit fields you do not want to change\n");
    return;
  }

  const filePath = path.join(env.baseDir, ".env.local");
  const current = readEnvFile(filePath);
  if (updates.api_url) {
    current.Z3GH0NE_OPENAI_API_URL = updates.api_url;
  }
  if (updates.key) {
    current.Z3GH0NE_OPENAI_API_KEY = updates.key;
  }
  if (updates.model) {
    current.Z3GH0NE_OPENAI_MODEL = updates.model;
  }
  if (updates.reasoning) {
    current.Z3GH0NE_OPENAI_REASONING_EFFORT = updates.reasoning;
  }

  writeFileSync(
    filePath,
    `${Object.entries(current).map(([key, value]) => `${key}=${value}`).join("\n")}\n`,
    "utf8"
  );
  output.write("updated .env.local; restart chat for changes to take effect\n");
}

function parseKeyValueArgs(args: string) {
  const result: Record<string, string> = {};
  for (const token of args.split(/\s+/).filter(Boolean)) {
    const equalsIndex = token.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }
    result[token.slice(0, equalsIndex)] = token.slice(equalsIndex + 1);
  }
  return result;
}

function readEnvFile(filePath: string) {
  const result: Record<string, string> = {};
  if (!existsSync(filePath)) {
    return result;
  }
  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }
    result[line.slice(0, equalsIndex)] = line.slice(equalsIndex + 1);
  }
  return result;
}
