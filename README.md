# ctf-agent

TypeScript CLI workspace for local CTF/security-agent coordination.

## Install

```bash
bun install
```

## Start The CLI

```bash
bun run dev
bun run cli -- help
bun run cli -- health
bun run cli -- task create --prompt "analyze this binary"
bun run cli -- chat --prompt "analyze this binary"
bun run cli -- task list
bun run cli -- tool list
```

The `chat` command opens a persistent terminal session. Ordinary input is saved
to the active task and sent through the Responses API. Slash commands such as
`/help`, `/new`, `/resume`, `/show`, `/comments`, `/verbose`, `/allow`,
`/scope`, `/doctor`, `/prompt`, `/tools`, and `/exit` are handled locally.

`bun run dev` opens chat directly. `bun run cli -- ...` runs one-off commands.

Runtime task history, chat comments, hub messages, uploads, workspaces, and logs
default to `D:/test-agent`. Override with `Z3GH0NE_DATA_DIR`,
`Z3GH0NE_UPLOADS_DIR`, `Z3GH0NE_WORKSPACES_DIR`, or `Z3GH0NE_LOG_DIR` when
needed.

Responses API defaults are read from `.env.local`:

```text
Z3GH0NE_OPENAI_API_URL=https://api.psydo.top
Z3GH0NE_OPENAI_API_KEY=<local key>
Z3GH0NE_OPENAI_MODEL=gpt-5.5
Z3GH0NE_OPENAI_REASONING_EFFORT=xhigh
```

## Common Commands

```bash
bun run cli -- task show <task_id>
bun run cli -- chat --task <task_id>
bun run cli -- task status <task_id> running --comment "started"
bun run cli -- hub send --channel handoff --message "handoff note"
bun run cli -- hub read handoff --limit 10
bun run cli -- report <task_id>
```

Tool execution passes raw tool arguments after `--`:

```bash
bun run cli -- tool run strings -- ./sample.bin
```

## Source Layout

```text
backend/src/
  cli.ts                 # tiny executable bootstrap
  cli/                  # argument parsing, output, and command handlers
  services/             # task, hub, report, and tool workflows shared by CLI/server
  tool/                 # tool contract, registry, dispatcher, schema normalization
  server/routes/        # compatibility HTTP routes
  agent/ctf/            # CTF agent placeholders by domain
  types/                # request and domain validation types
  prompt/               # local system prompt sections and prompt builder
```

Tool manifests live in `config/tools.yaml`. Each tool must define:

- `description`
- `command`
- `risk`
- `permissions`
- `requires_scope`
- `timeout`
- `max_args`
- `max_arg_length`
- `output_limit`

## Compatibility Server

The old HTTP server is no longer the default interaction model. It is still available for compatibility:

```bash
$env:Z3GH0NE_ADMIN_TOKEN="dev-token"
bun run serve
```

## Verification

```bash
bun run typecheck
bun run smoke
```
