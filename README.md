# ctf-agent

TypeScript CLI workspace for local CTF/security-agent coordination.

## Install

```bash
npm install
```

## Start The CLI

```bash
node scripts/ctf-agent.mjs help
node scripts/ctf-agent.mjs health
node scripts/ctf-agent.mjs task create --prompt "analyze this binary"
node scripts/ctf-agent.mjs chat --prompt "analyze this binary"
node scripts/ctf-agent.mjs task list
node scripts/ctf-agent.mjs tool list
```

`npm run dev`, `npm start`, and `npm run cli -- task list` are still available for
simple positional commands. Use `node scripts/ctf-agent.mjs ...` when passing
`--flags`, because npm may consume option-looking flags before they reach the CLI.

## Common Commands

```bash
node scripts/ctf-agent.mjs task show <task_id>
node scripts/ctf-agent.mjs chat --task <task_id>
node scripts/ctf-agent.mjs task status <task_id> running --comment "started"
node scripts/ctf-agent.mjs hub send --channel handoff --message "handoff note"
node scripts/ctf-agent.mjs hub read handoff --limit 10
node scripts/ctf-agent.mjs report <task_id>
```

Tool execution passes raw tool arguments after `--`:

```bash
node scripts/ctf-agent.mjs tool run strings -- ./sample.bin
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
npm run serve
```

## Verification

```bash
npm run typecheck
npm run smoke
```
