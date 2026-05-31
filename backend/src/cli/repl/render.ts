import type { ResponsesFunctionCall, ResponsesInput } from "../../provider/responses.js";
import type { AssistantObserver, AssistantReply, ToolTrace } from "../../services/assistant.js";
import type { ToolRunRequest } from "../../types/tool.js";

export class ReplTurnDisplay {
  private readonly startedAt = Date.now();
  private requestCount = 0;
  private toolStartedAt = new Map<string, number>();

  constructor(
    private readonly output: NodeJS.WriteStream,
    private readonly options: { verbose: boolean }
  ) {}

  printUserInput(text: string, commentId: string) {
    this.output.write(`\n[user]\n${indent(text)}\n`);
    this.output.write(`[saved] comment ${commentId}\n`);
  }

  observer(): AssistantObserver {
    return {
      onRequest: (input) => this.printRequest(input),
      onToolCall: (call, input) => this.printToolCall(call, input),
      onToolResult: (trace) => this.printToolResult(trace)
    };
  }

  printAssistant(reply: AssistantReply) {
    this.output.write(`[assistant] model=${reply.model} elapsed=${formatDuration(Date.now() - this.startedAt)}\n`);
    this.output.write(`${reply.text.trimEnd()}\n`);
    if (this.options.verbose && reply.tool_calls.length > 0) {
      this.output.write(`[summary] tool_calls=${reply.tool_calls.length} response_id=${reply.response_id ?? "none"}\n`);
    }
  }

  printError(message: string) {
    this.output.write(`[error] assistant failed after ${formatDuration(Date.now() - this.startedAt)}\n`);
    this.output.write(`${indent(message)}\n`);
  }

  private printRequest(input: ResponsesInput) {
    this.requestCount += 1;
    const label = this.requestCount === 1 ? "thinking" : "thinking with tool results";
    this.output.write(`[working] ${label} (request ${this.requestCount})\n`);
    if (!this.options.verbose) {
      return;
    }
    this.output.write(`[input] responses.request\n`);
    this.output.write(`${indent(formatRequestInput(input, 1600))}\n`);
  }

  private printToolCall(call: ResponsesFunctionCall, input: ToolRunRequest) {
    this.toolStartedAt.set(call.call_id, Date.now());
    this.output.write(`[tool] ${input.tool} running\n`);
    this.output.write(`${indent(formatToolInput(input))}\n`);
    if (this.options.verbose && call.raw_arguments) {
      this.output.write(`${indent(`raw_arguments: ${clip(call.raw_arguments, 1200)}`)}\n`);
    }
  }

  private printToolResult(trace: ToolTrace) {
    const startedAt = this.toolStartedAt.get(trace.call_id);
    const elapsed = startedAt ? ` elapsed=${formatDuration(Date.now() - startedAt)}` : "";
    const status = trace.output.allowed ? "done" : "blocked";
    this.output.write(`[tool] ${trace.tool} ${status}${elapsed}\n`);

    const lines = [
      trace.output.exit_code !== undefined ? `exit_code: ${trace.output.exit_code}` : null,
      trace.output.summary ? `summary: ${trace.output.summary}` : null,
      trace.output.error_code ? `error_code: ${trace.output.error_code}` : null,
      trace.output.error ? `error: ${trace.output.error}` : null,
      trace.output.truncated !== undefined ? `truncated: ${trace.output.truncated}` : null
    ].filter((line): line is string => Boolean(line));

    if (lines.length > 0) {
      this.output.write(`${indent(lines.join("\n"))}\n`);
    }

    if (this.options.verbose && trace.output.output) {
      this.output.write(`[output] ${trace.tool}\n`);
      this.output.write(`${indent(clip(trace.output.output.trimEnd(), 8000))}\n`);
    }
  }
}

function formatToolInput(input: ToolRunRequest) {
  return [
    `mode: ${input.mode}`,
    input.target ? `target: ${input.target}` : null,
    input.artifact_path ? `artifact_path: ${input.artifact_path}` : null,
    `args: ${JSON.stringify(input.args)}`
  ].filter((line): line is string => Boolean(line)).join("\n");
}

function formatRequestInput(requestInput: ResponsesInput, max: number) {
  if (typeof requestInput === "string") {
    return clip(requestInput, max);
  }
  return clip(JSON.stringify(requestInput, null, 2), max);
}

function indent(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => `  ${line}`)
    .join("\n");
}

function formatDuration(ms: number) {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

function clip(text: string, max: number) {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max)}\n... clipped ${text.length - max} chars`;
}
