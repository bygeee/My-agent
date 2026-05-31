# Target Project Structure

This document defines the target structure for the TypeScript refactor of `ctf-agent`.

The project stays on Bun workspaces and TypeScript. Docker, container runtime files, and Docker-oriented deployment conventions are out of scope.

## Goals

- Keep the runtime TypeScript-first, Bun-first, and CLI-first.
- Separate agent orchestration, sessions, tools, permissions, providers, storage, and HTTP routes.
- Keep CTF domain logic reusable outside the HTTP server.
- Make every tool explicit: schema, permission requirements, execution, and output format.
- Make every task traceable through sessions, messages, tool calls, artifacts, reports, and audit logs.
- Avoid framework-heavy rewrites unless they directly reduce project risk.

## Workspace Layout

```text
ctf-agent/
  package.json
  tsconfig.json
  backend/
    package.json
    src/
      cli.ts
      index.ts
      server.ts
      services/
      agent/
      session/
      tool/
      permission/
      provider/
      server/
      storage/
      runtime/
      ctf/
      report/
      types/
      smoke.ts
  product/
    package.json
    src/
      index.ts
      core/
      evidence/
      providers/
  config/
    tools.yaml
    allowed-scopes.yaml
    agent-policy.yaml
  data/
  docs/
  logs/
  scripts/
  tests/
  .external/
```

## Root

- `package.json` owns workspace scripts only.
- `tsconfig.json` owns shared compiler rules.
- `docs/` contains architecture, operation, and migration documents.
- `config/` contains local runtime configuration templates and defaults. `tools.yaml` is the canonical tool manifest.
- `data/` contains project-level sample or persisted data when needed.
- `logs/` contains local runtime logs and must not be required for tests.
- `scripts/` contains local developer automation.
- `tests/` contains integration and smoke tests.
- `.external/` is read-only reference material. Code from external projects must not be copied into active source without a deliberate rewrite.

## Backend Package

`backend` is the active runtime package. It owns the CLI, optional HTTP compatibility API, agent execution, tool dispatch, permission checks, local storage, and process bootstrap.

Target layout:

```text
backend/src/
  cli.ts
  cli/
    args.ts
    help.ts
    main.ts
    output.ts
    types.ts
    commands/
      health.ts
      task.ts
      tool.ts
      hub.ts
      report.ts
      repl.ts
  index.ts
  server.ts
  services/
    tasks.ts
    hub.ts
    tools.ts
    reports.ts
  prompt/
    types.ts
    system.ts
  runtime/
    env.ts
    paths.ts
    logger.ts
    errors.ts
    context.ts
  server/
    routes/
      health.ts
      tools.ts
      reports.ts
      hub.ts
      tasks.ts
  agent/
    agent.ts
    router.ts
    master.ts
    ctf/
      crypto.ts
      forensic.ts
      pwn.ts
      recon.ts
      reverse.ts
      web.ts
      report.ts
  session/
    session.ts
    message.ts
    tool-call.ts
    status.ts
    events.ts
    runner.ts
    store.ts
    summary.ts
  tool/
    definition.ts
    registry.ts
    dispatcher.ts
    schema.ts
  permission/
    policy.ts
    rule.ts
    approval.ts
    scope.ts
  provider/
    provider.ts
    registry.ts
    openai-compatible.ts
    mock.ts
  storage/
    file-store.ts
    audit-store.ts
    session-store.ts
    report-store.ts
  ctf/
    challenge.ts
    artifact.ts
    evidence.ts
    finding.ts
  report/
    markdown.ts
    serializer.ts
  types/
    api.ts
    task.ts
    tool.ts
```

## Backend Rules

- `cli.ts` is the default user interaction entrypoint and should call shared services instead of HTTP routes.
- `cli/*` owns CLI parsing, output, help text, and command modules. Command files may call services but should not reach into HTTP routes.
- `index.ts` starts the optional compatibility server and reads environment/config only through `runtime/`.
- `server.ts` wires routes and shared runtime context.
- `server/routes/*` may parse requests and format responses, but must not contain agent or tool business logic.
- `services/*` owns reusable local workflows shared by the CLI and compatibility HTTP routes.
- `agent/*` decides what should happen next, but does not directly perform filesystem writes or shell execution.
- `session/*` owns task state, message history, tool-call lifecycle, status, cancellation, and resume behavior.
- `tool/*` owns executable capabilities. Every tool must be registered through `tool/registry.ts` and described in `config/tools.yaml`.
- `permission/*` is the only place that decides whether a tool call is allowed, denied, or requires approval.
- `provider/*` hides model/provider-specific details behind a stable interface.
- `storage/*` owns persistence. Other modules should not write raw JSON files directly.
- `ctf/*` contains domain objects and CTF-specific helpers shared by agents, tools, and reports.
- `report/*` converts completed sessions/findings into writeups.

## Tool Contract

Each tool resolves to one definition shaped like this:

```ts
export type ToolDefinition<Input, Output> = {
  id: string
  description: string
  command: string[]
  risk: "low" | "medium" | "high"
  permissions: ToolPermission[]
  requires_scope: boolean
  timeout: number
  max_args: number
  max_arg_length: number
  output_limit: number
  inputSchema: ToolInputSchema
  execute?: (input: Input, context: ToolContext) => Promise<ToolResult<Output>>
}
```

The canonical manifest format is `config/tools.yaml`:

```yaml
tools:
  strings:
    description: "Extract printable strings from local binaries or forensic artifacts."
    command: ["strings"]
    risk: low
    permissions: ["process:spawn", "filesystem:read"]
    requires_scope: false
    timeout: 20
    max_args: 6
    max_arg_length: 260
    output_limit: 20000
```

Required behavior:

- Validate manifest and input before execution.
- Check permissions before side effects.
- Return structured output plus a human-readable summary.
- Record artifacts and evidence paths through the session context.
- Never write outside the active workspace unless permission explicitly allows it.

## Session Contract

A session is the durable unit of work.

It should contain:

- `sessionID`
- `status`
- `createdAt` and `updatedAt`
- user messages
- assistant messages
- tool calls
- artifacts
- evidence
- report references
- audit events

The HTTP API, CLI, and future UI should all operate on sessions instead of ad-hoc tasks.

## Product Package

`product` contains reusable domain logic that should not depend on the backend HTTP server.

Target layout:

```text
product/src/
  index.ts
  core/
    planning/
      engine.ts
    scoring/
      confidence.ts
  evidence/
    graph.ts
    model.ts
  providers/
    base.ts
    capability.ts
```

Rules:

- No HTTP route code in `product`.
- No direct process startup in `product`.
- No direct writes to backend runtime storage.
- Export pure types, planning logic, evidence models, and provider abstractions.

## Naming Rules

- Use singular domain folder names for runtime services: `agent`, `session`, `tool`, `provider`, `permission`.
- Use plural names only for route collections or test fixtures when that reads naturally.
- Use `kebab-case` for document and script filenames.
- Use `camelCase` for variables and functions.
- Use `PascalCase` for types and classes.
- Do not import local TypeScript files with `.ts` suffix. Use `.js` specifiers for NodeNext-compatible TypeScript output.

## Dependency Rules

Allowed dependency direction:

```text
server/routes -> agent/session/tool/provider/storage
agent -> session/tool/provider/permission/ctf/product
session -> storage/tool/ctf/report
tool -> permission/storage/ctf/runtime
report -> session/ctf/product
product -> no backend imports
```

Forbidden dependency direction:

```text
product -> backend
tool -> server/routes
agent -> server/routes
storage -> server/routes
provider -> server/routes
```

## Migration Order

1. Stabilize `runtime/`, `storage/`, and `types/`.
2. Move current route logic into thin `server/routes/*` modules.
3. Replace ad-hoc tool dispatch with `tool/registry.ts`.
4. Introduce `session/*` as the durable task state layer.
5. Move CTF-specific agent files into `agent/ctf/*`.
6. Move reusable challenge/evidence/report models into `ctf/*` and `product/*`.
7. Add tests around route behavior, tool permissions, and session persistence.

## Non-Goals

- No Docker files or Docker-based runtime assumptions.
- No Bun-only runtime assumptions.
- No desktop app, web console, cloud sync, or enterprise package split.
- No external project code vendoring from `.external/`.
