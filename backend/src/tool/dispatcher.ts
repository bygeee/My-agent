import { spawnSync } from "node:child_process";
import path from "node:path";
import { env } from "../lib/env.js";
import { PolicyGate } from "../core/policy.js";
import { ScopeValidator } from "../core/scope.js";
import { ToolRegistry } from "./registry.js";
import type { ToolDefinition, ToolResult } from "./definition.js";
import type { ToolRunRequest } from "../types/tool.js";
import { runBuiltinTool } from "./builtin.js";

const dangerousArgPattern = /[;&|`$]|\.\.\/|\/etc\/|\/proc\/|\/sys\//;

export class ToolDispatcher {
  private readonly registry = new ToolRegistry();
  private readonly scope = new ScopeValidator();
  private readonly policy = new PolicyGate();

  private error(code: string, message: string): ToolResult {
    return { allowed: false, error_code: code, error: message, summary: message };
  }

  async run(request: ToolRunRequest): Promise<ToolResult> {
    const tool = this.registry.get(request.tool);
    if (!tool) {
      return this.error("unknown_tool", `tool '${request.tool}' not found in registry`);
    }

    const policyCheck = this.policy.checkMode(request.mode);
    if (!policyCheck.allowed) {
      return this.error("policy_denied", policyCheck.reason);
    }

    const scopeTarget = inferScopeTarget(tool, request);
    if (scopeTarget) {
      const targetPolicy = this.policy.checkText(scopeTarget);
      if (!targetPolicy.allowed) {
        return this.error("policy_denied", targetPolicy.reason);
      }
    }

    if (tool.requires_scope) {
      if (!scopeTarget) {
        return this.error("scope_missing", "this tool requires a target within allowed scope");
      }
      const decision = this.scope.allowed(scopeTarget, request.mode);
      if (!decision.allowed) {
        return this.error("scope_denied", decision.reason);
      }
    }

    const argError = validateArgs(request.args, tool.max_args, tool.max_arg_length);
    if (argError) {
      return this.error("invalid_args", argError);
    }

    const command = [...tool.command];
    const binary = command[0];

    if (binary?.startsWith("builtin:")) {
      try {
        return await runBuiltinTool(tool, request);
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 300) : "builtin tool failed";
        return this.error("builtin_error", message);
      }
    }

    if (request.artifact_path) {
      const safeName = path.basename(request.artifact_path);
      if (!safeName || safeName.startsWith(".")) {
        return this.error("invalid_artifact", "artifact path is invalid");
      }
      const artifactPath = path.join(env.uploadsDir, safeName);
      if (!artifactPath.startsWith(`${env.uploadsDir.replace(/[\\/]+$/, "")}${path.sep}`)) {
        return this.error("invalid_artifact", "artifact path escapes sandbox");
      }
      command.push(artifactPath);
    }

    if (request.target) {
      command.push(request.target);
    }

    command.push(...request.args.slice(0, tool.max_args));

    const [spawnBinary, ...args] = command;
    if (!spawnBinary) {
      return this.error("invalid_tool", "tool command is empty");
    }

    try {
      const result = spawnSync(spawnBinary, args, {
        cwd: env.workspacesDir,
        timeout: tool.timeout * 1000,
        encoding: "utf8"
      });
      if (result.error) {
        if (isTimeoutError(result.error)) {
          return this.error("timeout", `tool exceeded ${tool.timeout}s timeout`);
        }
        if (/ENOENT/.test(result.error.message)) {
          return this.error("tool_not_found", "binary not available in local runtime");
        }
        return this.error("exec_error", result.error.message.slice(0, 200));
      }
      const rawOutput = `${result.stdout ?? ""}${result.stderr ?? ""}`;
      const output = rawOutput.slice(0, tool.output_limit);
      return {
        allowed: true,
        tool: request.tool,
        exit_code: result.status,
        output,
        summary: `${request.tool} exited with code ${result.status ?? "unknown"}`,
        truncated: rawOutput.length > tool.output_limit,
        timeout_used: tool.timeout
      };
    } catch (error) {
      if (error instanceof Error && isTimeoutError(error)) {
        return this.error("timeout", `tool exceeded ${tool.timeout}s timeout`);
      }
      if (error instanceof Error && /ENOENT/.test(error.message)) {
        return this.error("tool_not_found", "binary not available in local runtime");
      }
      return this.error("exec_error", error instanceof Error ? error.message.slice(0, 200) : "unknown exec error");
    }
  }
}

function isTimeoutError(error: Error) {
  return error.name === "ETIMEDOUT" || /ETIMEDOUT|timed out|timeout/i.test(error.message);
}

function validateArgs(args: string[], maxArgs: number, maxArgLength: number) {
  if (args.length > maxArgs) {
    return `too many arguments; maximum is ${maxArgs}`;
  }
  for (const arg of args) {
    if (dangerousArgPattern.test(arg)) {
      return `argument contains forbidden characters: ${arg.slice(0, 30)}`;
    }
    if (arg.length > maxArgLength) {
      return `argument too long; maximum is ${maxArgLength}`;
    }
  }
  return null;
}

function inferScopeTarget(tool: ToolDefinition, request: ToolRunRequest) {
  if (request.target) {
    return request.target;
  }
  if (!tool.requires_scope) {
    return undefined;
  }
  const input = request.input ?? {};
  for (const key of ["target", "url", "uri"]) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return undefined;
}
