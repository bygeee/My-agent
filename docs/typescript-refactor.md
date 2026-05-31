# TypeScript Refactor

The active backend runtime has been rewritten under `backend/src` and now runs as a local CLI-first Bun application.

## Entry points

- Root workspace: `package.json`
- Backend package: `backend/package.json`
- CLI bootstrap: `backend/src/cli.ts`
- CLI command modules: `backend/src/cli/commands/*`
- Shared local services: `backend/src/services/*`
- Tool contract and dispatcher: `backend/src/tool/*`
- Compatibility server bootstrap: `backend/src/index.ts`
- Compatibility HTTP server and route wiring: `backend/src/server.ts`

## Commands

Run from repo root:

```bash
bun run dev
bun run cli -- help
bun run cli -- health
bun run cli -- task create --prompt "analyze this binary"
bun run cli -- chat --prompt "analyze this binary"
bun run cli -- task list
```

`bun run dev` opens the persistent chat UI directly. `bun run cli -- ...` runs
one-off commands.

Compatibility HTTP server:

```bash
bun run serve
```

## Scope of the rewrite

- FastAPI routes were ported to TypeScript route modules on Node's built-in HTTP server.
- Local task, hub, report, and tool behavior now lives in shared service modules used by both the CLI and compatibility routes.
- CLI logic is split into argument parsing, output formatting, help text, and command modules.
- `chat`/`repl` keeps a persistent terminal session and sends ordinary input through the Responses API.
- Tool definitions are loaded from `config/tools.yaml` as explicit manifests instead of ad-hoc command entries.
- Pydantic validation was replaced with local request parsers.
- File-backed task, report, hub-message, audit, policy, scope, and tool-dispatch behavior was preserved.
- Bun runs TypeScript entrypoints directly in development and `bun build` emits production bundles under `backend/dist`.
- The runtime has no application dependencies; TypeScript is a development dependency for build and typecheck.
- Runtime config defaults to the root `config/` folder.
- Runtime data and logs default to `backend/.runtime-data/` and `backend/.runtime-logs/` for reliable local Node execution.

## Transitional note

Legacy Python files under `backend/app` still exist on disk for reference, but the active runtime path now points at the TypeScript CLI implementation.
