import { ResponsesProvider, type ResponsesFunctionCall, type ResponsesInput, type ResponsesTool } from "../provider/responses.js";
import { ToolDispatcher } from "../tool/dispatcher.js";
import { ToolRegistry } from "../tool/registry.js";
import { addTaskComment, loadTask, mergeTaskResult, type StoredTask } from "./tasks.js";
import type { ToolRunRequest } from "../types/tool.js";
import { buildSystemPrompt } from "../prompt/system.js";

export type AssistantReply = {
  text: string;
  response_id: string | null;
  model: string;
  tool_calls: ToolTrace[];
};

export type ToolTrace = {
  tool: string;
  call_id: string;
  input: ToolRunRequest;
  output: {
    allowed: boolean;
    exit_code?: number | null;
    summary?: string;
    error_code?: string;
    error?: string;
    output?: string;
    truncated?: boolean;
  };
};

export type AssistantObserver = {
  onRequest?: (input: ResponsesInput) => void;
  onToolCall?: (call: ResponsesFunctionCall, input: ToolRunRequest) => void;
  onToolResult?: (trace: ToolTrace) => void;
};

export async function replyToTask(
  taskId: string,
  userInput: string,
  observer: AssistantObserver = {}
): Promise<AssistantReply> {
  const task = await loadTask(taskId);
  setRuntimeAllowedTargets(task, userInput);
  const provider = new ResponsesProvider();
  const instructions = buildSystemPrompt({ task });
  const request = {
    instructions,
    input: buildInitialInput(task, userInput),
    maxOutputTokens: 4096,
    tools: buildResponseTools()
  };
  observer.onRequest?.(request.input);
  let response = await provider.create(request);
  const toolTraces: ToolTrace[] = [];

  for (let step = 0; step < 8 && response.functionCalls.length > 0; step += 1) {
    const toolOutputs = [];
    for (const call of response.functionCalls) {
      const input = buildToolRunRequest(call, task.mode);
      observer.onToolCall?.(call, input);
      const trace = await runToolCall(call, input);
      toolTraces.push(trace);
      observer.onToolResult?.(trace);
      toolOutputs.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(trace.output)
      });
    }
    const followUpInput = buildToolFollowUpInput(task, userInput, toolOutputs, toolTraces);
    observer.onRequest?.(followUpInput);
    response = await provider.create({
      instructions,
      input: followUpInput,
      maxOutputTokens: 4096,
      tools: buildResponseTools()
    });
  }

  const text = response.text || "[empty response]";
  await addTaskComment(taskId, text, "assistant");
  await mergeTaskResult(taskId, {
    last_response_id: response.id,
    last_model: response.model,
    last_usage: response.usage,
    last_tool_calls: toolTraces.map((trace) => ({
      tool: trace.tool,
      call_id: trace.call_id,
      input: trace.input,
      output: {
        allowed: trace.output.allowed,
        exit_code: trace.output.exit_code,
        summary: trace.output.summary,
        error_code: trace.output.error_code,
        error: trace.output.error,
        truncated: trace.output.truncated
      }
    }))
  });

  return {
    text,
    response_id: response.id,
    model: response.model,
    tool_calls: toolTraces
  };
}

function setRuntimeAllowedTargets(task: StoredTask, userInput: string) {
  const hosts = extractHosts(`${task.prompt}\n${userInput}`);
  if (hosts.length === 0) {
    return;
  }
  const existing = new Set(
    (process.env.Z3GH0NE_ALLOWED_TARGETS ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
  for (const host of hosts) {
    existing.add(host);
  }
  process.env.Z3GH0NE_ALLOWED_TARGETS = [...existing].join(",");
}

function extractHosts(text: string) {
  const hosts = new Set<string>();
  const urlPattern = /\bhttps?:\/\/[a-zA-Z0-9.-]+(?::\d+)?/g;
  for (const match of text.matchAll(urlPattern)) {
    try {
      hosts.add(new URL(match[0]).hostname);
    } catch {
      continue;
    }
  }
  const hostPortPattern = /\b([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(?::\d+)\b/g;
  for (const match of text.matchAll(hostPortPattern)) {
    const host = match[1];
    if (host) {
      hosts.add(host);
    }
  }
  return [...hosts];
}

function buildResponseTools(): ResponsesTool[] {
  return new ToolRegistry().list({ availableOnly: true }).map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: buildResponseToolParameters(tool)
  }));
}

function buildToolRunRequest(call: ResponsesFunctionCall, defaultMode: string): ToolRunRequest {
  const mode = typeof call.arguments.mode === "string" ? call.arguments.mode : defaultMode;
  const args = Array.isArray(call.arguments.args)
    ? call.arguments.args.filter((item): item is string => typeof item === "string")
    : [];
  const request: ToolRunRequest = {
    tool: call.name,
    mode,
    args,
    input: call.arguments
  };
  if (typeof call.arguments.target === "string") {
    request.target = call.arguments.target;
  } else if (typeof call.arguments.url === "string") {
    request.target = call.arguments.url;
  }
  if (typeof call.arguments.artifact_path === "string") {
    request.artifact_path = call.arguments.artifact_path;
  }
  return request;
}

type ListedTool = ReturnType<ToolRegistry["list"]>[number];

function buildResponseToolParameters(tool: ListedTool) {
  const schema = tool.input_schema;
  const properties = isRecord(schema.properties) ? { ...schema.properties } : {};
  delete properties.tool;

  return {
    type: "object",
    additionalProperties: schema.additionalProperties,
    required: schema.required.filter((field) => field !== "tool"),
    properties
  };
}

async function runToolCall(call: ResponsesFunctionCall, input: ToolRunRequest): Promise<ToolTrace> {
  const result = await new ToolDispatcher().run(input);
  const outputText = typeof result.output === "string" ? result.output.slice(0, 8000) : undefined;
  const output: ToolTrace["output"] = {
    allowed: result.allowed
  };
  if (result.exit_code !== undefined) {
    output.exit_code = result.exit_code;
  }
  if (result.summary !== undefined) {
    output.summary = result.summary;
  }
  if (result.error_code !== undefined) {
    output.error_code = result.error_code;
  }
  if (result.error !== undefined) {
    output.error = result.error;
  }
  if (outputText !== undefined) {
    output.output = outputText;
  }
  if (result.truncated !== undefined) {
    output.truncated = result.truncated;
  }
  return {
    tool: call.name,
    call_id: call.call_id,
    input,
    output
  };
}

function buildInitialInput(task: StoredTask, userInput: string) {
  const comments = [...task.comments];
  const latest = comments.at(-1);
  if (latest && latest.by !== "assistant" && latest.text === userInput) {
    comments.pop();
  }

  const transcript = comments
    .slice(-20)
    .map((comment) => `${comment.by === "assistant" ? "assistant" : "user"}: ${comment.text}`)
    .join("\n");
  return [
    `Task prompt: ${task.prompt}`,
    transcript ? `Recent conversation:\n${transcript}` : "",
    `User input:\n${userInput}`
  ].filter(Boolean).join("\n\n");
}

function buildToolFollowUpInput(
  task: StoredTask,
  userInput: string,
  toolOutputs: Array<Record<string, unknown>>,
  traces: ToolTrace[]
) {
  return [
    buildInitialInput(task, userInput),
    "Tool outputs:",
    JSON.stringify(toolOutputs, null, 2),
    "Tool trace summary:",
    JSON.stringify(traces.map((trace) => ({
      tool: trace.tool,
      input: trace.input,
      output: {
        allowed: trace.output.allowed,
        exit_code: trace.output.exit_code,
        summary: trace.output.summary,
        error_code: trace.output.error_code,
        error: trace.output.error,
        truncated: trace.output.truncated
      }
    })), null, 2),
    "Use these tool results to answer the user. If more tools are needed, call them."
  ].join("\n\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
