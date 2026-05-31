# TypeScript Refactor

The active backend runtime has been rewritten under `backend/src` and now runs as a local CLI-first Node.js application.

## Entry points

- Root workspace: `package.json`
- Backend package: `backend/package.json`
- CLI bootstrap: `backend/src/cli.ts`
- Shared local services: `backend/src/services/*`
- Compatibility server bootstrap: `backend/src/index.ts`
- Compatibility HTTP server and route wiring: `backend/src/server.ts`

## Commands

Run from repo root:

```bash
npm run cli -- --help
npm run cli -- health
npm run cli -- task create --prompt "analyze this binary"
npm run cli -- task list
```

`npm run dev` and `npm run start` both invoke the CLI entrypoint.

Compatibility HTTP server:

```bash
npm run serve
```

## Scope of the rewrite

- FastAPI routes were ported to TypeScript route modules on Node's built-in HTTP server.
- Local task, hub, report, and tool behavior now lives in shared service modules used by both the CLI and compatibility routes.
- Pydantic validation was replaced with local request parsers.
- File-backed task, report, hub-message, audit, policy, scope, and tool-dispatch behavior was preserved.
- The backend is compiled with `tsc` and runs emitted JavaScript from `backend/dist`.
- The runtime has no application dependencies; TypeScript is a development dependency for build and typecheck.
- Runtime config defaults to the root `config/` folder.
- Runtime data and logs default to `backend/.runtime-data/` and `backend/.runtime-logs/` for reliable local Node execution.

## Transitional note

Legacy Python files under `backend/app` still exist on disk for reference, but the active runtime path now points at the TypeScript CLI implementation.
