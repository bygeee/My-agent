import { env } from "../lib/env.js";

export type ResponsesRequest = {
  input: ResponsesInput;
  instructions?: string;
  previousResponseId?: string;
  maxOutputTokens?: number;
  reasoningEffort?: string;
  tools?: ResponsesTool[];
};

export type ResponsesInput = string | Array<Record<string, unknown>>;

export type ResponsesTool = {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type ResponsesFunctionCall = {
  id: string | null;
  call_id: string;
  name: string;
  arguments: Record<string, unknown>;
  raw_arguments: string;
};

export type ResponsesResult = {
  id: string | null;
  text: string;
  model: string;
  usage: Record<string, unknown>;
  raw: Record<string, unknown>;
  functionCalls: ResponsesFunctionCall[];
};

export class ResponsesProvider {
  readonly name = "openai_responses";
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly reasoningEffort: string;

  constructor(
    apiUrl = env.openaiApiUrl,
    apiKey = env.openaiApiKey,
    model = env.openaiModel,
    reasoningEffort = env.openaiReasoningEffort
  ) {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
    this.model = model;
    this.reasoningEffort = reasoningEffort;
  }

  available() {
    return Boolean(this.apiKey);
  }

  async create(request: ResponsesRequest): Promise<ResponsesResult> {
    if (!this.available()) {
      throw new Error("OpenAI Responses provider is not configured");
    }

    const body: Record<string, unknown> = {
      model: this.model,
      input: request.input,
      reasoning: {
        effort: request.reasoningEffort ?? this.reasoningEffort
      }
    };
    if (request.instructions) {
      body.instructions = request.instructions;
    }
    if (request.previousResponseId) {
      body.previous_response_id = request.previousResponseId;
    }
    if (request.maxOutputTokens) {
      body.max_output_tokens = request.maxOutputTokens;
    }
    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools;
    }

    const response = await fetch(resolveResponsesUrl(this.apiUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const data = await response.json() as Record<string, unknown>;
    if (!response.ok) {
      const detail = readError(data);
      throw new Error(`Responses API failed (${response.status}): ${detail}`);
    }

    return {
      id: typeof data.id === "string" ? data.id : null,
      text: extractOutputText(data),
      model: typeof data.model === "string" ? data.model : this.model,
      usage: isRecord(data.usage) ? data.usage : {},
      raw: data,
      functionCalls: extractFunctionCalls(data)
    };
  }
}

function resolveResponsesUrl(apiUrl: string) {
  const normalized = apiUrl.replace(/\/+$/, "");
  if (normalized.endsWith("/responses")) {
    return normalized;
  }
  if (normalized.endsWith("/v1")) {
    return `${normalized}/responses`;
  }
  return `${normalized}/v1/responses`;
}

function extractOutputText(data: Record<string, unknown>) {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text;
  }

  const output = data.output;
  if (!Array.isArray(output)) {
    return "";
  }

  const chunks: string[] = [];
  for (const item of output) {
    if (!isRecord(item) || !Array.isArray(item.content)) {
      continue;
    }
    for (const content of item.content) {
      if (isRecord(content) && content.type === "output_text" && typeof content.text === "string") {
        chunks.push(content.text);
      }
    }
  }
  return chunks.join("");
}

function extractFunctionCalls(data: Record<string, unknown>) {
  const output = data.output;
  if (!Array.isArray(output)) {
    return [];
  }

  const calls: ResponsesFunctionCall[] = [];
  for (const item of output) {
    if (!isRecord(item) || item.type !== "function_call") {
      continue;
    }
    const callId = typeof item.call_id === "string" ? item.call_id : "";
    const name = typeof item.name === "string" ? item.name : "";
    const rawArguments = typeof item.arguments === "string" ? item.arguments : "{}";
    if (!callId || !name) {
      continue;
    }
    calls.push({
      id: typeof item.id === "string" ? item.id : null,
      call_id: callId,
      name,
      raw_arguments: rawArguments,
      arguments: parseArguments(rawArguments)
    });
  }
  return calls;
}

function parseArguments(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function readError(data: Record<string, unknown>) {
  const error = data.error;
  if (isRecord(error) && typeof error.message === "string") {
    return error.message.slice(0, 500);
  }
  return JSON.stringify(data).slice(0, 500);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
