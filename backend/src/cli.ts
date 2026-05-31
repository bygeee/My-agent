#!/usr/bin/env node
import { env } from "./lib/env.js";
import { HttpError, parseOrThrow } from "./lib/http.js";
import { taskCommentSchema, taskRequestSchema, taskStatusUpdateSchema } from "./types/task.js";
import { hubMessageSchema } from "./types/hub.js";
import { toolRunRequestSchema } from "./types/tool.js";
import {
  addTaskArtifact,
  addTaskComment,
  cancelTask,
  createTask,
  listTasks,
  loadTask,
  updateTaskStatus
} from "./services/tasks.js";
import { getHubInfo, listHubChannels, listHubMessages, sendHubMessage } from "./services/hub.js";
import { listTools, runTool } from "./services/tools.js";
import { readTaskReport } from "./services/reports.js";

type FlagValue = boolean | string | string[];

type ParsedArgs = {
  positionals: string[];
  flags: Record<string, FlagValue>;
  passthrough: string[];
};

type Column = {
  key: string;
  header: string;
  max?: number;
};

class CliError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 2) {
    super(message);
    this.exitCode = exitCode;
  }
}

await main(process.argv.slice(2)).catch((error: unknown) => {
  const exitCode = error instanceof CliError ? error.exitCode : 1;
  const status = error instanceof HttpError ? `${error.statusCode}: ` : "";
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`error: ${status}${message}\n`);
  process.exit(exitCode);
});

async function main(argv: string[]) {
  const parsed = parseArgs(argv);
  if (flagBool(parsed, "help") || parsed.positionals.length === 0) {
    printHelp();
    return;
  }

  const user = flagString(parsed, "user") ?? env.adminUser;
  const [group] = parsed.positionals;

  switch (group) {
    case "health":
      printJson({
        ok: true,
        name: "z3gh0ne",
        version: "0.3.0",
        interface: "cli",
        model: env.model,
        llm_mode: env.llmMode,
        user,
        config_dir: env.configDir,
        data_dir: env.dataDir,
        workspaces_dir: env.workspacesDir
      });
      return;
    case "task":
    case "tasks":
      await runTaskCommand(parsed, user);
      return;
    case "tool":
    case "tools":
      await runToolCommand(parsed, user);
      return;
    case "hub":
      await runHubCommand(parsed, user);
      return;
    case "report":
    case "reports":
      await runReportCommand(parsed);
      return;
    case "help":
      printHelp();
      return;
    default:
      throw new CliError(`unknown command: ${group}`);
  }
}

async function runTaskCommand(parsed: ParsedArgs, user: string) {
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
      const task = await createTask(req, user);
      printJson(task);
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

async function runToolCommand(parsed: ParsedArgs, user: string) {
  const [, action] = parsed.positionals;
  switch (action) {
    case "list": {
      const result = listTools();
      if (flagBool(parsed, "json")) {
        printJson(result);
      } else {
        printTable(result.tools, [
          { key: "name", header: "name", max: 24 },
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

async function runHubCommand(parsed: ParsedArgs, user: string) {
  const [, action] = parsed.positionals;
  switch (action) {
    case "info":
      printJson(getHubInfo(user));
      return;
    case "channels": {
      const result = await listHubChannels();
      if (flagBool(parsed, "json")) {
        printJson(result);
      } else {
        printTable(result.channels, [
          { key: "channel", header: "channel", max: 16 },
          { key: "message_count", header: "messages", max: 10 },
          { key: "last_message_ts", header: "last_message_ts", max: 30 }
        ]);
      }
      return;
    }
    case "send": {
      const message = flagString(parsed, "message") ?? parsed.positionals.slice(2).join(" ").trim();
      const channel = flagString(parsed, "channel") ?? "default";
      const metadata = parseMetadata(flagString(parsed, "metadata") ?? flagString(parsed, "metadata-json"));
      const req = parseOrThrow(hubMessageSchema, { channel, message, metadata });
      printJson(await sendHubMessage(req, user));
      return;
    }
    case "read": {
      const channel = requirePositional(parsed, 2, "hub read requires a channel");
      const result = await listHubMessages(channel, {
        limit: flagString(parsed, "limit"),
        sender: flagString(parsed, "sender"),
        msg_type: flagString(parsed, "type") ?? flagString(parsed, "msg-type"),
        since: flagString(parsed, "since")
      });
      printJson(result);
      return;
    }
    default:
      throw new CliError("hub command must be one of: info, channels, send, read");
  }
}

async function runReportCommand(parsed: ParsedArgs) {
  const taskId = requirePositional(parsed, 1, "report requires a task id");
  process.stdout.write(await readTaskReport(taskId));
}

function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, FlagValue> = {};
  const passthrough: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) {
      continue;
    }
    if (token === "--") {
      passthrough.push(...argv.slice(index + 1));
      break;
    }
    if (token === "-h") {
      addFlag(flags, "help", true);
      continue;
    }
    if (token.startsWith("--") && token.length > 2) {
      const withoutPrefix = token.slice(2);
      const equalsIndex = withoutPrefix.indexOf("=");
      if (equalsIndex >= 0) {
        addFlag(flags, withoutPrefix.slice(0, equalsIndex), withoutPrefix.slice(equalsIndex + 1));
        continue;
      }

      const next = argv[index + 1];
      if (next !== undefined && !next.startsWith("-")) {
        addFlag(flags, withoutPrefix, next);
        index += 1;
      } else {
        addFlag(flags, withoutPrefix, true);
      }
      continue;
    }
    if (isKeyValueToken(token)) {
      const equalsIndex = token.indexOf("=");
      addFlag(flags, token.slice(0, equalsIndex), token.slice(equalsIndex + 1));
      continue;
    }
    positionals.push(token);
  }

  return { positionals, flags, passthrough };
}

function isKeyValueToken(token: string) {
  const equalsIndex = token.indexOf("=");
  return equalsIndex > 0 && !token.startsWith("=") && !token.includes("://");
}

function addFlag(flags: Record<string, FlagValue>, key: string, value: boolean | string) {
  const normalized = key.replace(/_/g, "-");
  const existing = flags[normalized];
  if (existing === undefined) {
    flags[normalized] = value;
    return;
  }
  if (Array.isArray(existing)) {
    existing.push(String(value));
    return;
  }
  flags[normalized] = [String(existing), String(value)];
}

function flagString(parsed: ParsedArgs, name: string) {
  const value = parsed.flags[name];
  if (Array.isArray(value)) {
    return value.at(-1);
  }
  if (typeof value === "string") {
    return value;
  }
  return undefined;
}

function flagArray(parsed: ParsedArgs, name: string) {
  const value = parsed.flags[name];
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string") {
    return [value];
  }
  return [];
}

function flagBool(parsed: ParsedArgs, name: string) {
  return parsed.flags[name] === true;
}

function assignFlag(target: Record<string, unknown>, key: string, value: string | undefined) {
  if (value !== undefined) {
    target[key] = value;
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

function parseMetadata(raw: string | undefined) {
  if (!raw) {
    return {};
  }
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CliError("--metadata must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function requirePositional(parsed: ParsedArgs, index: number, message: string) {
  const value = parsed.positionals[index];
  if (!value) {
    throw new CliError(message);
  }
  return value;
}

function printJson(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printTable(rows: Array<Record<string, unknown>>, columns: Column[]) {
  if (rows.length === 0) {
    process.stdout.write("(none)\n");
    return;
  }

  const formattedRows = rows.map((row) => columns.map((column) => formatCell(row[column.key], column.max)));
  const widths = columns.map((column, index) => {
    const cells = formattedRows.map((row) => row[index] ?? "");
    return Math.max(column.header.length, ...cells.map((cell) => cell.length));
  });

  process.stdout.write(`${columns.map((column, index) => column.header.padEnd(widths[index] ?? 0)).join("  ")}\n`);
  process.stdout.write(`${widths.map((width) => "-".repeat(width)).join("  ")}\n`);
  for (const row of formattedRows) {
    process.stdout.write(`${row.map((cell, index) => cell.padEnd(widths[index] ?? 0)).join("  ")}\n`);
  }
}

function formatCell(value: unknown, max = 80) {
  const text = value === undefined || value === null ? "" : String(value);
  if (text.length <= max) {
    return text;
  }
  if (max <= 3) {
    return text.slice(0, max);
  }
  return `${text.slice(0, max - 3)}...`;
}

function printHelp() {
  process.stdout.write(`ctf-agent CLI

Usage:
  ctf-agent health
  ctf-agent task create --prompt "analyze this binary" [--mode ctf_challenge] [--target TARGET]
  ctf-agent task list [--status pending] [--mode ctf_challenge] [--json]
  ctf-agent task show <task_id>
  ctf-agent task status <task_id> <pending|running|waiting_approval|completed|failed|blocked> [--comment TEXT]
  ctf-agent task comment <task_id> --text TEXT
  ctf-agent task artifact <task_id> --path FILE [--label TEXT]
  ctf-agent task cancel <task_id>
  ctf-agent tool list [--json]
  ctf-agent tool run <tool> [--mode local_lab] [--target TARGET] [--artifact-path FILE] -- [args...]
  ctf-agent hub info
  ctf-agent hub channels
  ctf-agent hub send --channel handoff --message TEXT [--metadata '{"type":"note"}']
  ctf-agent hub read <channel> [--limit 20] [--sender USER] [--type TYPE]
  ctf-agent report <task_id>

Global options:
  --user USER       Audit user for local CLI actions. Defaults to Z3GH0NE_ADMIN_USER or agent.
  --json           Print table-style list commands as JSON.
  --help, -h       Show this help.

Examples:
  npm run cli -- task create prompt="analyze ./sample"
  npm run cli -- task list
  npm run cli -- tool list
  npm run cli -- hub send channel=handoff message="local CLI is active"

Notes:
  Direct ctf-agent/node execution supports --flags. When using npm run, prefer key=value
  arguments because npm may consume option-looking --flags before they reach the CLI.
`);
}
