import type { ToolDefinition, ToolInputSchema, ToolManifest, ToolPermission, ToolRisk } from "./definition.js";

type ClaudeToolSpec = {
  name: string;
  description: string;
  builtin?: string;
  risk?: ToolRisk;
  permissions?: ToolPermission[];
  requires_scope?: boolean;
  timeout?: number;
  max_args?: number;
  max_arg_length?: number;
  output_limit?: number;
  inputSchema?: ToolInputSchema;
};

const emptySchema: ToolInputSchema = {
  type: "object",
  required: [],
  additionalProperties: false,
  properties: {}
};

const genericUnavailableSchema: ToolInputSchema = {
  type: "object",
  required: [],
  additionalProperties: true,
  properties: {
    reason: { type: "string" }
  }
};

const unsupportedClaudeTools = [
  "Agent",
  "SendUserMessage",
  "Brief",
  "DiscoverSkills",
  "EnterPlanMode",
  "ExitPlanMode",
  "EnterWorktree",
  "ExitWorktree",
  "ExecuteExtraTool",
  "ListMcpResourcesTool",
  "ReadMcpResourceTool",
  "McpAuth",
  "mcp",
  "MCPTool",
  "LSP",
  "NotebookEdit",
  "OverflowTest",
  "PushNotification",
  "RemoteTrigger",
  "REPL",
  "ReviewArtifact",
  "CronCreate",
  "CronDelete",
  "CronList",
  "SendMessage",
  "SendUserFile",
  "Skill",
  "Snip",
  "SubscribePR",
  "SuggestBackgroundPR",
  "Task",
  "TeamCreate",
  "TeamDelete",
  "TerminalCapture",
  "TestingPermission",
  "TungstenTool",
  "VaultHttpFetch",
  "VerifyPlanExecution",
  "WebBrowser",
  "WebSearch",
  "workflow",
  "Monitor"
];

export function getClaudeCodeToolDefinitions(): Record<string, ToolDefinition> {
  return Object.fromEntries(claudeToolSpecs.map((spec) => [spec.name, buildClaudeTool(spec)]));
}

function buildClaudeTool(spec: ClaudeToolSpec): ToolDefinition {
  const manifest: ToolManifest = {
    id: spec.name,
    description: spec.description,
    command: [`builtin:${spec.builtin ?? `unsupported:${spec.name}`}`],
    risk: spec.risk ?? "low",
    permissions: spec.permissions ?? ["state:read"],
    requires_scope: Boolean(spec.requires_scope),
    timeout: spec.timeout ?? 30,
    max_args: spec.max_args ?? 8,
    max_arg_length: spec.max_arg_length ?? 2000,
    output_limit: spec.output_limit ?? 20000,
    source: "claude-code"
  };
  return {
    ...manifest,
    inputSchema: spec.inputSchema ?? genericUnavailableSchema
  };
}

const filePathProperty = {
  type: "string",
  description: "Absolute path or path relative to the project workspace."
};

const claudeToolSpecs: ClaudeToolSpec[] = [
  {
    name: "Read",
    builtin: "read",
    description: "Read a file from the local filesystem.",
    permissions: ["filesystem:read"],
    inputSchema: {
      type: "object",
      required: ["file_path"],
      additionalProperties: false,
      properties: {
        file_path: filePathProperty,
        offset: { type: "number", description: "1-based starting line." },
        limit: { type: "number", description: "Maximum number of lines to return." }
      }
    }
  },
  {
    name: "Write",
    builtin: "write",
    description: "Write a file in the project workspace.",
    risk: "medium",
    permissions: ["filesystem:write"],
    inputSchema: {
      type: "object",
      required: ["file_path", "content"],
      additionalProperties: false,
      properties: {
        file_path: filePathProperty,
        content: { type: "string" }
      }
    }
  },
  {
    name: "Edit",
    builtin: "edit",
    description: "Replace text in an existing project file.",
    risk: "medium",
    permissions: ["filesystem:read", "filesystem:write"],
    inputSchema: {
      type: "object",
      required: ["file_path", "old_string", "new_string"],
      additionalProperties: false,
      properties: {
        file_path: filePathProperty,
        old_string: { type: "string" },
        new_string: { type: "string" },
        replace_all: { type: "boolean" }
      }
    }
  },
  {
    name: "Glob",
    builtin: "glob",
    description: "Fast file pattern matching in the project workspace.",
    permissions: ["filesystem:read"],
    inputSchema: {
      type: "object",
      required: ["pattern"],
      additionalProperties: false,
      properties: {
        pattern: { type: "string", description: "Glob pattern such as **/*.ts." },
        path: { type: "string", description: "Optional search root." }
      }
    }
  },
  {
    name: "Grep",
    builtin: "grep",
    description: "Search file contents with a regular expression.",
    permissions: ["filesystem:read"],
    inputSchema: {
      type: "object",
      required: ["pattern"],
      additionalProperties: false,
      properties: {
        pattern: { type: "string" },
        path: { type: "string" },
        glob: { type: "string" },
        output_mode: { type: "string", enum: ["files_with_matches", "content", "count"] },
        case_sensitive: { type: "boolean" }
      }
    }
  },
  {
    name: "Bash",
    builtin: "bash",
    description: "Run a shell command in the project workspace with local safety checks.",
    risk: "medium",
    permissions: ["process:spawn"],
    timeout: 120,
    output_limit: 30000,
    inputSchema: {
      type: "object",
      required: ["command"],
      additionalProperties: false,
      properties: {
        command: { type: "string" },
        description: { type: "string" },
        timeout: { type: "number" }
      }
    }
  },
  {
    name: "PowerShell",
    builtin: "powershell",
    description: "Run a PowerShell command in the project workspace with local safety checks.",
    risk: "medium",
    permissions: ["process:spawn"],
    timeout: 120,
    output_limit: 30000,
    inputSchema: {
      type: "object",
      required: ["command"],
      additionalProperties: false,
      properties: {
        command: { type: "string" },
        description: { type: "string" },
        timeout: { type: "number" }
      }
    }
  },
  {
    name: "TodoWrite",
    builtin: "todo_write",
    description: "Update the todo list for the current task.",
    permissions: ["state:write"],
    inputSchema: {
      type: "object",
      required: ["todos"],
      additionalProperties: false,
      properties: {
        todos: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: true,
            properties: {
              content: { type: "string" },
              activeForm: { type: "string" },
              status: { type: "string" }
            }
          }
        }
      }
    }
  },
  {
    name: "TaskCreate",
    builtin: "task_create",
    description: "Create a new task in the local task list.",
    permissions: ["state:write"],
    inputSchema: {
      type: "object",
      required: ["prompt"],
      additionalProperties: false,
      properties: {
        prompt: { type: "string" },
        mode: { type: "string" },
        target: { type: "string" },
        priority: { type: "string" },
        tags: { type: "array", items: { type: "string" } }
      }
    }
  },
  {
    name: "TaskGet",
    builtin: "task_get",
    description: "Read one task by id.",
    permissions: ["state:read"],
    inputSchema: {
      type: "object",
      required: ["task_id"],
      additionalProperties: false,
      properties: { task_id: { type: "string" } }
    }
  },
  {
    name: "TaskList",
    builtin: "task_list",
    description: "List local tasks.",
    permissions: ["state:read"],
    inputSchema: {
      type: "object",
      required: [],
      additionalProperties: false,
      properties: {
        status: { type: "string" },
        mode: { type: "string" },
        owner: { type: "string" },
        limit: { type: "number" }
      }
    }
  },
  {
    name: "TaskUpdate",
    builtin: "task_update",
    description: "Update a local task status and optional comment.",
    permissions: ["state:write"],
    inputSchema: {
      type: "object",
      required: ["task_id", "status"],
      additionalProperties: false,
      properties: {
        task_id: { type: "string" },
        status: { type: "string" },
        comment: { type: "string" }
      }
    }
  },
  {
    name: "TaskOutput",
    builtin: "task_output",
    description: "Return the stored result and recent comments for a task.",
    permissions: ["state:read"],
    inputSchema: {
      type: "object",
      required: ["task_id"],
      additionalProperties: false,
      properties: { task_id: { type: "string" } }
    }
  },
  {
    name: "TaskStop",
    builtin: "task_stop",
    description: "Cancel a local task that has not finished.",
    risk: "medium",
    permissions: ["state:write"],
    inputSchema: {
      type: "object",
      required: ["task_id"],
      additionalProperties: false,
      properties: { task_id: { type: "string" } }
    }
  },
  {
    name: "AskUserQuestion",
    builtin: "ask_user_question",
    description: "Record a concise question for the user when work is blocked on input.",
    permissions: ["state:write"],
    inputSchema: {
      type: "object",
      required: ["question"],
      additionalProperties: false,
      properties: {
        question: { type: "string" },
        options: { type: "array", items: { type: "string" } }
      }
    }
  },
  {
    name: "Sleep",
    builtin: "sleep",
    description: "Wait for a short amount of time.",
    permissions: ["state:read"],
    timeout: 65,
    inputSchema: {
      type: "object",
      required: ["seconds"],
      additionalProperties: false,
      properties: { seconds: { type: "number" } }
    }
  },
  {
    name: "WebFetch",
    builtin: "web_fetch",
    description: "Fetch an explicitly scoped HTTP/HTTPS URL and return status, headers, and body. Supports GET, HEAD, and POST for authorized CTF/lab workflows.",
    risk: "medium",
    permissions: ["network:targeted"],
    requires_scope: true,
    timeout: 30,
    output_limit: 30000,
    inputSchema: {
      type: "object",
      required: ["url"],
      additionalProperties: false,
      properties: {
        url: { type: "string" },
        prompt: { type: "string" },
        method: { type: "string", enum: ["GET", "HEAD", "POST"] },
        headers: {
          type: "object",
          additionalProperties: { type: "string" },
          properties: {}
        },
        body: { type: "string" },
        form: {
          type: "object",
          additionalProperties: true,
          properties: {}
        },
        json: {
          type: "object",
          additionalProperties: true,
          properties: {}
        }
      }
    }
  },
  {
    name: "Config",
    builtin: "config",
    description: "Inspect local ctf-agent runtime configuration without secrets.",
    permissions: ["state:read"],
    inputSchema: emptySchema
  },
  {
    name: "CtxInspect",
    builtin: "ctx_inspect",
    description: "Inspect local task, tool, and runtime context.",
    permissions: ["state:read"],
    inputSchema: emptySchema
  },
  {
    name: "SearchExtraTools",
    builtin: "search_extra_tools",
    description: "Search registered local tools by name and description.",
    permissions: ["state:read"],
    inputSchema: {
      type: "object",
      required: ["query"],
      additionalProperties: false,
      properties: { query: { type: "string" } }
    }
  },
  {
    name: "LocalMemoryRecall",
    builtin: "local_memory_recall",
    description: "Search recent local task history for relevant memories.",
    permissions: ["state:read"],
    inputSchema: {
      type: "object",
      required: ["query"],
      additionalProperties: false,
      properties: { query: { type: "string" } }
    }
  },
  {
    name: "ListPeers",
    builtin: "list_peers",
    description: "List local peer/session information known to this process.",
    permissions: ["state:read"],
    inputSchema: emptySchema
  },
  {
    name: "StructuredOutput",
    builtin: "structured_output",
    description: "Return a structured JSON object as tool output.",
    permissions: ["state:read"],
    inputSchema: {
      type: "object",
      required: ["value"],
      additionalProperties: true,
      properties: { value: {} }
    }
  },
  ...unsupportedClaudeTools.map((name) => ({
    name,
    description: `${name} is registered from bygeee/claude-code but is not yet implemented in this local adapter.`
  }))
];
