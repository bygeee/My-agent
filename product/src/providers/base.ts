export type LLMResponse = {
  id?: string | null;
  text: string;
  model: string;
  usage: Record<string, unknown>;
  raw?: Record<string, unknown>;
};

export interface BaseProvider {
  readonly name: string;
  complete(prompt: string, system?: string, maxTokens?: number): Promise<LLMResponse> | LLMResponse;
  available(): boolean;
}

export class LocalAgentProvider implements BaseProvider {
  readonly name = "local_agent";

  available() {
    return true;
  }

  complete(): LLMResponse {
    return {
      text: "[local agent mode: reasoning handled by calling agent, not via API]",
      model: "local-claude-code",
      usage: {}
    };
  }
}

export class OpenAICompatibleProvider implements BaseProvider {
  readonly name = "openai_responses";
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(
    apiKey = process.env.Z3GH0NE_OPENAI_API_KEY ?? process.env.Z3GH0NE_OPENAI_KEY ?? process.env.OPENAI_API_KEY ?? "",
    baseUrl = process.env.Z3GH0NE_OPENAI_API_URL
      ?? process.env.Z3GH0NE_OPENAI_BASE_URL
      ?? process.env.OPENAI_BASE_URL
      ?? "https://api.psydo.top",
    model = process.env.Z3GH0NE_OPENAI_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-5.4",
    private readonly reasoningEffort = process.env.Z3GH0NE_OPENAI_REASONING_EFFORT
      ?? process.env.OPENAI_REASONING_EFFORT
      ?? "xhigh"
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.model = model;
  }

  available() {
    return Boolean(this.apiKey);
  }

  async complete(prompt: string, system = "", maxTokens = 4096): Promise<LLMResponse> {
    if (!this.available()) {
      return { text: "[provider not configured]", model: this.model, usage: {} };
    }

    try {
      const response = await fetch(resolveResponsesUrl(this.baseUrl), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.model,
          instructions: system || "You are z3gh0ne, a security analysis assistant.",
          input: prompt,
          reasoning: {
            effort: this.reasoningEffort
          },
          max_output_tokens: maxTokens
        })
      });
      const data = await response.json() as {
        id?: string;
        output_text?: string;
        output?: unknown;
        usage?: Record<string, unknown>;
      };
      return {
        id: data.id ?? null,
        text: extractResponsesText(data),
        model: this.model,
        usage: data.usage ?? {},
        raw: data as Record<string, unknown>
      };
    } catch (error) {
      return { text: `[error: ${String(error).slice(0, 200)}]`, model: this.model, usage: {} };
    }
  }
}

function resolveResponsesUrl(baseUrl: string) {
  const normalized = baseUrl.replace(/\/+$/, "");
  if (normalized.endsWith("/responses")) {
    return normalized;
  }
  if (normalized.endsWith("/v1")) {
    return `${normalized}/responses`;
  }
  return `${normalized}/v1/responses`;
}

function extractResponsesText(data: { output_text?: string; output?: unknown }) {
  if (typeof data.output_text === "string") {
    return data.output_text;
  }
  if (!Array.isArray(data.output)) {
    return "";
  }
  const chunks: string[] = [];
  for (const item of data.output) {
    if (!item || typeof item !== "object" || !("content" in item) || !Array.isArray(item.content)) {
      continue;
    }
    for (const content of item.content) {
      if (
        content
        && typeof content === "object"
        && "type" in content
        && content.type === "output_text"
        && "text" in content
        && typeof content.text === "string"
      ) {
        chunks.push(content.text);
      }
    }
  }
  return chunks.join("");
}

export class AnthropicProvider implements BaseProvider {
  readonly name = "anthropic";
  private readonly apiKey: string;
  private readonly model: string;

  constructor(
    apiKey = process.env.Z3GH0NE_ANTHROPIC_KEY ?? "",
    model = process.env.Z3GH0NE_ANTHROPIC_MODEL ?? "claude-sonnet-4-6"
  ) {
    this.apiKey = apiKey;
    this.model = model;
  }

  available() {
    return Boolean(this.apiKey);
  }

  async complete(prompt: string, system = "", maxTokens = 4096): Promise<LLMResponse> {
    if (!this.available()) {
      return { text: "[provider not configured]", model: this.model, usage: {} };
    }

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: maxTokens,
          system: system || "You are z3gh0ne, a security analysis assistant.",
          messages: [{ role: "user", content: prompt }]
        })
      });
      const data = await response.json() as {
        content?: Array<{ text?: string }>;
        usage?: Record<string, unknown>;
      };
      return {
        text: data.content?.map((block) => block.text ?? "").join("") ?? "",
        model: this.model,
        usage: data.usage ?? {},
        raw: data as Record<string, unknown>
      };
    } catch (error) {
      return { text: `[error: ${String(error).slice(0, 200)}]`, model: this.model, usage: {} };
    }
  }
}

export class ProviderRegistry {
  private readonly providers = new Map<string, BaseProvider>();
  private defaultProvider: string | null = null;

  register(provider: BaseProvider, options: { default?: boolean } = {}) {
    this.providers.set(provider.name, provider);
    if (options.default || !this.defaultProvider) {
      this.defaultProvider = provider.name;
    }
  }

  get(name?: string) {
    const key = name ?? this.defaultProvider;
    return key ? this.providers.get(key) : undefined;
  }

  listAvailable() {
    return [...this.providers.values()].filter((provider) => provider.available()).map((provider) => provider.name);
  }

  static createDefault() {
    const registry = new ProviderRegistry();
    registry.register(new LocalAgentProvider(), { default: true });
    registry.register(new AnthropicProvider());
    registry.register(new OpenAICompatibleProvider());
    return registry;
  }
}
