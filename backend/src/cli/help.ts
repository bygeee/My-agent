export function printHelp() {
  process.stdout.write(`ctf-agent CLI

Usage:
  ctf-agent health
  ctf-agent task create --prompt "analyze this binary" [--mode ctf_challenge] [--target TARGET]
  ctf-agent task list [--status pending] [--mode ctf_challenge] [--json]
  ctf-agent task show <task_id>
  ctf-agent task status <task_id> <pending|running|waiting_approval|completed|failed|blocked> [--comment TEXT]
  ctf-agent task comment <task_id> --text TEXT
  ctf-agent task artifact <task_id> --path FILE [--label TEXT]
  ctf-agent task cancel <task_id>
  ctf-agent tool list [--json]
  ctf-agent tool run <tool> [--mode local_lab] [--target TARGET] [--artifact-path FILE] [--input JSON] -- [args...]
  ctf-agent hub info
  ctf-agent hub channels
  ctf-agent hub send --channel handoff --message TEXT [--metadata '{"type":"note"}']
  ctf-agent hub read <channel> [--limit 20] [--sender USER] [--type TYPE]
  ctf-agent report <task_id>
  ctf-agent chat --prompt "analyze this CTF challenge"
  ctf-agent chat --task <task_id>

Global options:
  --user USER       Audit user for local CLI actions. Defaults to Z3GH0NE_ADMIN_USER or agent.
  --json           Print table-style list commands as JSON.
  --help, -h       Show this help.

Examples:
  bun run dev
  bun run cli -- task create --prompt "analyze ./sample"
  bun run cli -- chat --prompt "analyze ./sample"
  bun run cli -- chat --task 85847591-876d-4866-9714-77fbcf736cd5
  bun run cli -- task list
  bun run cli -- tool list
  bun run cli -- hub send --channel handoff --message "local CLI is active"

Notes:
  bun run dev opens the persistent chat UI directly.
`);
}
