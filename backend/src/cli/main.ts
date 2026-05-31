import { env } from "../lib/env.js";
import { HttpError } from "../lib/http.js";
import { parseArgs, flagBool, flagString } from "./args.js";
import { printHelp } from "./help.js";
import { CliError } from "./types.js";
import { runHealthCommand } from "./commands/health.js";
import { runTaskCommand } from "./commands/task.js";
import { runToolCommand } from "./commands/tool.js";
import { runHubCommand } from "./commands/hub.js";
import { runReportCommand } from "./commands/report.js";
import { runReplCommand } from "./commands/repl.js";

export async function runCli(argv: string[]) {
  try {
    await main(argv);
  } catch (error) {
    const exitCode = error instanceof CliError ? error.exitCode : 1;
    const status = error instanceof HttpError ? `${error.statusCode}: ` : "";
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`error: ${status}${message}\n`);
    process.exit(exitCode);
  }
}

async function main(argv: string[]) {
  const parsed = parseArgs(argv);
  if (flagBool(parsed, "help") || parsed.positionals.length === 0) {
    printHelp();
    return;
  }

  const user = flagString(parsed, "user") ?? env.adminUser;
  const [group] = parsed.positionals;

  switch (group) {
    case "health":
      runHealthCommand(user);
      return;
    case "task":
    case "tasks":
      await runTaskCommand(parsed, user);
      return;
    case "tool":
    case "tools":
      await runToolCommand(parsed, user);
      return;
    case "hub":
      await runHubCommand(parsed, user);
      return;
    case "report":
    case "reports":
      await runReportCommand(parsed);
      return;
    case "chat":
    case "repl":
      await runReplCommand(parsed, user);
      return;
    case "help":
      printHelp();
      return;
    default:
      throw new CliError(`unknown command: ${group}`);
  }
}
