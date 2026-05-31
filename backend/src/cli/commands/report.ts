import { readTaskReport } from "../../services/reports.js";
import type { ParsedArgs } from "../types.js";
import { requirePositional } from "../args.js";

export async function runReportCommand(parsed: ParsedArgs) {
  const taskId = requirePositional(parsed, 1, "report requires a task id");
  process.stdout.write(await readTaskReport(taskId));
}
