import path from "node:path";
import { readFile } from "node:fs/promises";
import { env } from "../lib/env.js";
import { HttpError } from "../lib/http.js";

export async function readTaskReport(taskId: string) {
  const filePath = path.join(env.dataDir, "tasks", `${taskId}.json`);
  try {
    return await readFile(filePath, "utf8");
  } catch {
    throw new HttpError(404, "task not found");
  }
}
