import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../lib/env.js";
import { parseOrThrow } from "../lib/http.js";
import { taskRequestSchema, taskStatusUpdateSchema } from "../types/task.js";
import type { ToolRunRequest } from "../types/tool.js";
import { createTask, listTasks, loadTask, mergeTaskResult, updateTaskStatus, cancelTask } from "../services/tasks.js";
import type { ToolDefinition, ToolResult } from "./definition.js";

const destructiveCommandPattern =
  /\b(rm\s+-rf|Remove-Item\b.*\b-Recurse\b|del\s+\/[sq]|rd\s+\/s|git\s+reset\s+--hard|git\s+clean\s+-fd|shutdown|format)\b/i;

export async function runBuiltinTool(tool: ToolDefinition, request: ToolRunRequest): Promise<ToolResult> {
  const name = tool.command[0]?.slice("builtin:".length) ?? "";
  if (name.startsWith("unsupported:")) {
    const toolName = name.slice("unsupported:".length);
    return errorResult("not_implemented", `${toolName} is registered from bygeee/claude-code but is not implemented in this local adapter yet`);
  }

  switch (name) {
    case "read":
      return runRead(tool, request);
    case "write":
      return runWrite(tool, request);
    case "edit":
      return runEdit(tool, request);
    case "glob":
      return runGlob(tool, request);
    case "grep":
      return runGrep(tool, request);
    case "bash":
      return runShell("cmd", tool, request);
    case "powershell":
      return runShell("powershell", tool, request);
    case "todo_write":
      return runTodoWrite(request);
    case "task_create":
      return runTaskCreate(request);
    case "task_get":
      return runTaskGet(request);
    case "task_list":
      return runTaskList(request);
    case "task_update":
      return runTaskUpdate(request);
    case "task_output":
      return runTaskOutput(request);
    case "task_stop":
      return runTaskStop(request);
    case "ask_user_question":
      return runAskUserQuestion(request);
    case "sleep":
      return runSleep(tool, request);
    case "web_fetch":
      return runHttpTool(resolveRequestedHttpMethod(request), tool, request);
    case "config":
      return ok("Config", JSON.stringify(readPublicConfig(), null, 2), "local config inspected");
    case "ctx_inspect":
      return runCtxInspect();
    case "search_extra_tools":
      return runSearchExtraTools(request);
    case "local_memory_recall":
      return runLocalMemoryRecall(request);
    case "list_peers":
      return ok("ListPeers", JSON.stringify({ self: { name: "ctf-agent", kind: "local-cli" }, peers: [] }, null, 2), "listed local peers");
    case "structured_output":
      return ok("StructuredOutput", JSON.stringify(input(request).value ?? input(request), null, 2), "structured output returned");
    case "http_get":
      return runHttpTool("GET", tool, request);
    case "http_head":
      return runHttpTool("HEAD", tool, request);
    default:
      return errorResult("unknown_builtin", `builtin tool '${tool.command[0]}' is not implemented`);
  }
}

async function runRead(tool: ToolDefinition, request: ToolRunRequest): Promise<ToolResult> {
  const filePath = resolveReadablePath(readString(input(request).file_path, request.artifact_path));
  const content = await readFile(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  const offset = clampNumber(input(request).offset, 1, Math.max(lines.length, 1));
  const limit = clampNumber(input(request).limit, 1, 2000);
  const selected = lines.slice(offset - 1, offset - 1 + limit);
  const numbered = selected.map((line, index) => `${String(offset + index).padStart(5, " ")}\t${line}`).join("\n");
  return ok(tool.id, clip(numbered, tool.output_limit), `read ${path.relative(env.baseDir, filePath) || filePath}`);
}

async function runWrite(tool: ToolDefinition, request: ToolRunRequest): Promise<ToolResult> {
  const filePath = resolveWritablePath(readString(input(request).file_path));
  const content = readString(input(request).content);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
  return ok(tool.id, `wrote ${content.length} bytes to ${filePath}`, `wrote ${path.relative(env.baseDir, filePath) || filePath}`);
}

async function runEdit(tool: ToolDefinition, request: ToolRunRequest): Promise<ToolResult> {
  const filePath = resolveWritablePath(readString(input(request).file_path));
  const oldString = readString(input(request).old_string);
  const newString = readString(input(request).new_string);
  const replaceAll = input(request).replace_all === true;
  const original = await readFile(filePath, "utf8");
  if (!original.includes(oldString)) {
    return errorResult("not_found", "old_string was not found in file");
  }
  const occurrences = original.split(oldString).length - 1;
  if (!replaceAll && occurrences > 1) {
    return errorResult("ambiguous_edit", "old_string appears multiple times; set replace_all=true or provide a unique old_string");
  }
  const updated = replaceAll ? original.split(oldString).join(newString) : original.replace(oldString, newString);
  await writeFile(filePath, updated, "utf8");
  return ok(tool.id, `replaced ${replaceAll ? occurrences : 1} occurrence(s) in ${filePath}`, `edited ${path.relative(env.baseDir, filePath) || filePath}`);
}

async function runGlob(tool: ToolDefinition, request: ToolRunRequest): Promise<ToolResult> {
  const pattern = readString(input(request).pattern);
  const root = resolveReadablePath(readOptionalString(input(request).path) ?? env.baseDir);
  const matcher = globToRegex(pattern);
  const files = await collectFiles(root, 2500);
  const matches = files
    .map((file) => normalizePath(path.relative(root, file)))
    .filter((file) => matcher.test(file))
    .slice(0, 500);
  return ok(tool.id, matches.join("\n"), `matched ${matches.length} file(s)`);
}

async function runGrep(tool: ToolDefinition, request: ToolRunRequest): Promise<ToolResult> {
  const pattern = readString(input(request).pattern);
  const flags = input(request).case_sensitive === true ? "g" : "gi";
  const regex = new RegExp(pattern, flags);
  const root = resolveReadablePath(readOptionalString(input(request).path) ?? env.baseDir);
  const mode = readOptionalString(input(request).output_mode) ?? "content";
  const glob = readOptionalString(input(request).glob);
  const files = (await stat(root)).isFile() ? [root] : await collectFiles(root, 3000);
  const matcher = glob ? globToRegex(glob) : null;
  const lines: string[] = [];
  let count = 0;

  for (const file of files) {
    const rel = normalizePath(path.relative(root, file));
    if (matcher && !matcher.test(rel)) {
      continue;
    }
    let content = "";
    try {
      content = await readFile(file, "utf8");
    } catch {
      continue;
    }
    regex.lastIndex = 0;
    if (!regex.test(content)) {
      continue;
    }
    count += 1;
    if (mode === "files_with_matches") {
      lines.push(file);
      continue;
    }
    if (mode === "count") {
      const matches = content.match(new RegExp(pattern, flags)) ?? [];
      lines.push(`${file}:${matches.length}`);
      continue;
    }
    content.split(/\r?\n/).forEach((line, index) => {
      regex.lastIndex = 0;
      if (regex.test(line)) {
        lines.push(`${file}:${index + 1}: ${line}`);
      }
    });
    if (lines.length > 500) {
      break;
    }
  }

  return ok(tool.id, clip(lines.join("\n"), tool.output_limit), `grep matched ${count} file(s)`);
}

function runShell(kind: "cmd" | "powershell", tool: ToolDefinition, request: ToolRunRequest): ToolResult {
  const command = readString(input(request).command ?? request.args.join(" "));
  if (destructiveCommandPattern.test(command)) {
    return errorResult("dangerous_command", "command looks destructive; ask the user to run or approve it explicitly");
  }
  const timeout = Math.min(tool.timeout, clampNumber(input(request).timeout, 1, tool.timeout));
  const executable = kind === "powershell" ? "powershell.exe" : (process.env.ComSpec ?? "cmd.exe");
  const args = kind === "powershell"
    ? ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command]
    : ["/d", "/s", "/c", command];
  const result = spawnSync(executable, args, {
    cwd: env.baseDir,
    encoding: "utf8",
    timeout: timeout * 1000
  });
  if (result.error) {
    return errorResult(isTimeoutError(result.error) ? "timeout" : "exec_error", result.error.message.slice(0, 300));
  }
  const raw = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  return {
    allowed: true,
    tool: tool.id,
    exit_code: result.status,
    output: clip(raw, tool.output_limit),
    summary: `${tool.id} exited with code ${result.status ?? "unknown"}`,
    truncated: raw.length > tool.output_limit,
    timeout_used: timeout
  };
}

async function runTodoWrite(request: ToolRunRequest): Promise<ToolResult> {
  const rawTodos = input(request).todos;
  const todos = Array.isArray(rawTodos) ? rawTodos : [];
  const taskId = readOptionalString(input(request).task_id);
  if (taskId) {
    await mergeTaskResult(taskId, { todos });
  }
  return ok("TodoWrite", JSON.stringify({ todos }, null, 2), `stored ${todos.length} todo(s)${taskId ? ` on ${taskId}` : ""}`);
}

async function runTaskCreate(request: ToolRunRequest): Promise<ToolResult> {
  const req = parseOrThrow(taskRequestSchema, {
    prompt: readString(input(request).prompt),
    mode: readOptionalString(input(request).mode) ?? request.mode,
    target: readOptionalString(input(request).target),
    priority: readOptionalString(input(request).priority) ?? "medium",
    tags: Array.isArray(input(request).tags) ? input(request).tags : []
  });
  const task = await createTask(req, "assistant-tool");
  return ok("TaskCreate", JSON.stringify(task, null, 2), `created task ${task.task_id}`);
}

async function runTaskGet(request: ToolRunRequest): Promise<ToolResult> {
  const task = await loadTask(readString(input(request).task_id));
  return ok("TaskGet", JSON.stringify(task, null, 2), `loaded task ${task.task_id}`);
}

async function runTaskList(request: ToolRunRequest): Promise<ToolResult> {
  const rawLimit = input(request).limit;
  const tasks = await listTasks({
    status: readOptionalString(input(request).status),
    mode: readOptionalString(input(request).mode),
    owner: readOptionalString(input(request).owner),
    limit: typeof rawLimit === "number" || typeof rawLimit === "string" ? rawLimit : undefined
  });
  return ok("TaskList", JSON.stringify(tasks, null, 2), `listed ${tasks.total} task(s)`);
}

async function runTaskUpdate(request: ToolRunRequest): Promise<ToolResult> {
  const taskId = readString(input(request).task_id);
  const status = readString(input(request).status);
  const update = parseOrThrow(taskStatusUpdateSchema, {
    status,
    comment: readOptionalString(input(request).comment)
  });
  const task = await updateTaskStatus(taskId, update, "assistant-tool");
  return ok("TaskUpdate", JSON.stringify(task, null, 2), `updated task ${task.task_id} to ${task.status}`);
}

async function runTaskOutput(request: ToolRunRequest): Promise<ToolResult> {
  const task = await loadTask(readString(input(request).task_id));
  return ok("TaskOutput", JSON.stringify({
    task_id: task.task_id,
    status: task.status,
    result: task.result,
    comments: task.comments.slice(-20)
  }, null, 2), `read output for ${task.task_id}`);
}

async function runTaskStop(request: ToolRunRequest): Promise<ToolResult> {
  const result = await cancelTask(readString(input(request).task_id), "assistant-tool");
  return ok("TaskStop", JSON.stringify(result, null, 2), `stopped task ${result.task_id}`);
}

function runAskUserQuestion(request: ToolRunRequest): ToolResult {
  return {
    allowed: false,
    tool: "AskUserQuestion",
    error_code: "user_input_required",
    error: readString(input(request).question),
    summary: "assistant requested user input",
    output: JSON.stringify({
      question: readString(input(request).question),
      options: Array.isArray(input(request).options) ? input(request).options : []
    }, null, 2)
  };
}

async function runSleep(tool: ToolDefinition, request: ToolRunRequest): Promise<ToolResult> {
  const seconds = Math.min(clampNumber(input(request).seconds, 1, 60), tool.timeout);
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  return ok("Sleep", `slept ${seconds}s`, `slept ${seconds}s`);
}

type HttpMethod = "GET" | "HEAD" | "POST";

async function runHttpTool(method: HttpMethod, tool: ToolDefinition, request: ToolRunRequest): Promise<ToolResult> {
  let url: URL;
  try {
    url = resolveHttpUrl(request);
  } catch (error) {
    return errorResult("invalid_target", error instanceof Error ? error.message : "invalid URL");
  }
  let requestInit: RequestInit;
  try {
    requestInit = buildHttpRequestInit(method, request);
  } catch (error) {
    return errorResult("invalid_input", error instanceof Error ? error.message : "invalid HTTP input");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), tool.timeout * 1000);
  try {
    const response = await fetch(url, {
      ...requestInit,
      redirect: "manual",
      signal: controller.signal
    });
    const body = method === "HEAD" ? "" : await response.text();
    const output = formatHttpOutput(url, response, body, tool.output_limit);
    return {
      allowed: true,
      tool: tool.id,
      exit_code: 0,
      output: output.text,
      summary: `${method} ${url.href} -> ${response.status} ${response.statusText || ""}`.trim(),
      truncated: output.truncated,
      timeout_used: tool.timeout
    };
  } catch (error) {
    if (controller.signal.aborted) {
      return errorResult("timeout", `tool exceeded ${tool.timeout}s timeout`);
    }
    return errorResult("network_error", error instanceof Error ? error.message.slice(0, 200) : "network request failed");
  } finally {
    clearTimeout(timer);
  }
}

function resolveRequestedHttpMethod(request: ToolRunRequest): HttpMethod {
  const value = readOptionalString(input(request).method)?.toUpperCase();
  if (value === "GET" || value === "HEAD" || value === "POST") {
    return value;
  }
  return "GET";
}

function buildHttpRequestInit(method: HttpMethod, request: ToolRunRequest): RequestInit {
  const headers = buildHttpHeaders(input(request).headers);
  const init: RequestInit = { method, headers };
  if (method === "GET" || method === "HEAD") {
    return init;
  }

  if (input(request).json !== undefined) {
    headers.set("Content-Type", headers.get("Content-Type") ?? "application/json");
    init.body = JSON.stringify(input(request).json);
    return init;
  }

  const form = input(request).form;
  if (form !== undefined) {
    headers.set("Content-Type", headers.get("Content-Type") ?? "application/x-www-form-urlencoded");
    init.body = encodeFormBody(form);
    return init;
  }

  const body = input(request).body ?? request.args[1];
  if (typeof body === "string") {
    headers.set("Content-Type", headers.get("Content-Type") ?? "application/x-www-form-urlencoded");
    init.body = body;
    return init;
  }

  return init;
}

function buildHttpHeaders(value: unknown) {
  const headers = new Headers({ "User-Agent": "ctf-agent/1.0" });
  if (value === undefined) {
    return headers;
  }
  if (!isPlainRecord(value)) {
    throw new Error("headers must be an object");
  }
  for (const [key, rawValue] of Object.entries(value)) {
    if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(key)) {
      throw new Error(`invalid header name: ${key}`);
    }
    if (/^(host|content-length|connection)$/i.test(key)) {
      throw new Error(`header ${key} is managed by the HTTP client`);
    }
    if (typeof rawValue !== "string" || rawValue.length > 2000) {
      throw new Error(`header ${key} must be a string up to 2000 characters`);
    }
    headers.set(key, rawValue);
  }
  return headers;
}

function encodeFormBody(value: unknown) {
  if (!isPlainRecord(value)) {
    throw new Error("form must be an object");
  }
  const params = new URLSearchParams();
  for (const [key, rawValue] of Object.entries(value)) {
    if (rawValue === undefined || rawValue === null) {
      continue;
    }
    if (Array.isArray(rawValue)) {
      for (const item of rawValue) {
        params.append(key, String(item));
      }
      continue;
    }
    params.set(key, String(rawValue));
  }
  return params.toString();
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function resolveHttpUrl(request: ToolRunRequest) {
  const directUrl = readOptionalString(input(request).url);
  if (directUrl) {
    return parseHttpUrl(directUrl);
  }

  const base = parseHttpUrl(readString(request.target));
  const pathArg = request.args[0];
  if (!pathArg) {
    return base;
  }

  const relative = pathArg.trim();
  if (!relative || relative.startsWith("//") || relative.includes("\\")) {
    throw new Error("path argument must be a same-origin HTTP path");
  }
  if (/^https?:\/\//i.test(relative)) {
    throw new Error("pass full URLs through target or url, not args");
  }
  const resolved = new URL(relative, base);
  assertHttpUrl(resolved);
  if (resolved.protocol !== base.protocol || resolved.hostname !== base.hostname || resolved.port !== base.port) {
    throw new Error("path argument must stay on the scoped target origin");
  }
  return resolved;
}

function parseHttpUrl(value: string) {
  const url = new URL(value.includes("://") ? value : `http://${value}`);
  assertHttpUrl(url);
  return url;
}

function assertHttpUrl(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("only http and https URLs are supported");
  }
  if (url.username || url.password) {
    throw new Error("URL credentials are not allowed");
  }
}

async function runCtxInspect(): Promise<ToolResult> {
  const tools = (await import("./registry.js")).ToolRegistry;
  const registry = new tools();
  return ok("CtxInspect", JSON.stringify({
    baseDir: env.baseDir,
    dataDir: env.dataDir,
    tools: registry.list().length,
    availableTools: registry.list({ availableOnly: true }).length
  }, null, 2), "context inspected");
}

async function runSearchExtraTools(request: ToolRunRequest): Promise<ToolResult> {
  const query = readString(input(request).query).toLowerCase();
  const { ToolRegistry } = await import("./registry.js");
  const matches = new ToolRegistry().list()
    .filter((tool) => `${tool.name} ${tool.description}`.toLowerCase().includes(query))
    .slice(0, 20);
  return ok("SearchExtraTools", JSON.stringify({ tools: matches }, null, 2), `found ${matches.length} tool(s)`);
}

async function runLocalMemoryRecall(request: ToolRunRequest): Promise<ToolResult> {
  const query = readString(input(request).query).toLowerCase();
  const tasks = await listTasks({ limit: 100 });
  const matches = [];
  for (const item of tasks.tasks) {
    const task = await loadTask(String(item.task_id));
    const haystack = `${task.prompt}\n${task.comments.map((comment) => comment.text).join("\n")}`.toLowerCase();
    if (haystack.includes(query)) {
      matches.push({
        task_id: task.task_id,
        status: task.status,
        prompt: task.prompt,
        comments: task.comments.slice(-3)
      });
    }
    if (matches.length >= 10) {
      break;
    }
  }
  return ok("LocalMemoryRecall", JSON.stringify({ matches }, null, 2), `found ${matches.length} matching task(s)`);
}

function readPublicConfig() {
  return {
    baseDir: env.baseDir,
    configDir: env.configDir,
    dataDir: env.dataDir,
    logDir: env.logDir,
    uploadsDir: env.uploadsDir,
    workspacesDir: env.workspacesDir,
    apiUrl: env.openaiApiUrl,
    model: env.openaiModel,
    reasoning: env.openaiReasoningEffort,
    keyConfigured: Boolean(env.openaiApiKey)
  };
}

function resolveReadablePath(value: string | undefined) {
  const resolved = resolveWorkspacePath(value ?? "");
  assertInside(resolved, [env.baseDir, env.dataDir, env.uploadsDir, env.workspacesDir], "path is outside allowed read roots");
  return resolved;
}

function resolveWritablePath(value: string | undefined) {
  const resolved = resolveWorkspacePath(value ?? "");
  assertInside(resolved, [env.baseDir, env.uploadsDir, env.workspacesDir], "path is outside allowed write roots");
  return resolved;
}

function resolveWorkspacePath(value: string) {
  if (!value.trim()) {
    throw new Error("path is required");
  }
  return path.resolve(path.isAbsolute(value) ? value : path.join(env.baseDir, value));
}

function assertInside(resolved: string, roots: string[], message: string) {
  const normalized = `${path.normalize(resolved)}${existsSync(resolved) ? "" : ""}`;
  const allowed = roots.some((root) => {
    const normalizedRoot = path.normalize(root).replace(/[\\/]+$/, "");
    return normalized === normalizedRoot || normalized.startsWith(`${normalizedRoot}${path.sep}`);
  });
  if (!allowed) {
    throw new Error(message);
  }
}

async function collectFiles(root: string, max: number) {
  const files: string[] = [];
  async function walk(dir: string) {
    if (files.length >= max) {
      return;
    }
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") {
        continue;
      }
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
      if (files.length >= max) {
        return;
      }
    }
  }
  await walk(root);
  return files;
}

function globToRegex(pattern: string) {
  const normalized = normalizePath(pattern);
  let regex = "";
  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    const next = normalized[i + 1];
    if (char === "*" && next === "*") {
      regex += ".*";
      i += 1;
    } else if (char === "*") {
      regex += "[^/]*";
    } else if (char === "?") {
      regex += ".";
    } else {
      regex += escapeRegex(char ?? "");
    }
  }
  return new RegExp(`^${regex}$`, "i");
}

function formatHttpOutput(url: URL, response: Response, body: string, outputLimit: number) {
  const headerLines = [...response.headers.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}: ${value}`);
  const fullText = [
    `url: ${url.href}`,
    `status: ${response.status} ${response.statusText}`,
    "headers:",
    ...headerLines.map((line) => `  ${line}`),
    ...(body ? ["", "body:", body] : [])
  ].join("\n");
  return {
    text: fullText.slice(0, outputLimit),
    truncated: fullText.length > outputLimit
  };
}

function input(request: ToolRunRequest) {
  return request.input ?? {};
}

function readString(value: unknown, fallback?: string) {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (fallback !== undefined) {
    return fallback;
  }
  throw new Error("required string input is missing");
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function clampNumber(value: unknown, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function ok(tool: string, output: string, summary: string): ToolResult {
  return {
    allowed: true,
    tool,
    exit_code: 0,
    output,
    summary,
    truncated: false
  };
}

function errorResult(code: string, message: string): ToolResult {
  return { allowed: false, error_code: code, error: message, summary: message };
}

function isTimeoutError(error: Error) {
  return error.name === "ETIMEDOUT" || /ETIMEDOUT|timed out|timeout/i.test(error.message);
}

function clip(text: string, max: number) {
  return text.length <= max ? text : text.slice(0, max);
}

function normalizePath(value: string) {
  return value.replace(/\\/g, "/");
}

function escapeRegex(value: string) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}
