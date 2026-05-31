export type ToolRisk = "low" | "medium" | "high";

export type ToolPermission =
  | "filesystem:read"
  | "filesystem:write"
  | "process:spawn"
  | "network:targeted"
  | "state:read"
  | "state:write"
  | "mcp:read"
  | "mcp:write";

export type ToolManifest = {
  id: string;
  description: string;
  command: string[];
  risk: ToolRisk;
  permissions: ToolPermission[];
  requires_scope: boolean;
  timeout: number;
  max_args: number;
  max_arg_length: number;
  output_limit: number;
  source?: string;
};

export type ToolInputSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: boolean | Record<string, unknown>;
};

export type ToolDefinition<Input = unknown, Output = unknown> = ToolManifest & {
  inputSchema: ToolInputSchema;
  execute?: (input: Input, context: ToolContext) => Promise<ToolResult<Output>> | ToolResult<Output>;
};

export type ToolContext = {
  cwd: string;
  user: string;
  mode: string;
  target?: string;
};

export type ToolResult<Output = string> = {
  allowed: boolean;
  error_code?: string;
  error?: string;
  tool?: string;
  exit_code?: number | null;
  output?: Output;
  summary?: string;
  truncated?: boolean;
  timeout_used?: number;
};

export type ToolRegistryConfig = {
  tools?: Record<string, Partial<ToolManifest>>;
};
