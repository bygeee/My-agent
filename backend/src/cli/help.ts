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
  ctf-agent tool run <tool> [--mode local_lab] [--target TARGET] [--artifact-path FILE] -- [args...]
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
  node scripts/ctf-agent.mjs task create --prompt "analyze ./sample"
  node scripts/ctf-agent.mjs chat --prompt "analyze ./sample"
  node scripts/ctf-agent.mjs chat --task 85847591-876d-4866-9714-77fbcf736cd5
  node scripts/ctf-agent.mjs task list
  node scripts/ctf-agent.mjs tool list
  node scripts/ctf-agent.mjs hub send --channel handoff --message "local CLI is active"

Notes:
  npm run cli is available for simple positional commands, but npm may consume
  option-looking --flags before they reach the CLI.
`);
}
