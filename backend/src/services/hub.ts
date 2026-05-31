import path from "node:path";
import { appendFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { env } from "../lib/env.js";
import { ensureDir } from "../lib/fs.js";
import { HttpError } from "../lib/http.js";
import { audit } from "../core/audit.js";
import { channels, type Channel, type HubMessageInput } from "../types/hub.js";

export type HubMessageQuery = {
  limit?: number | string;
  sender?: string;
  msg_type?: string;
  since?: string;
};

export function getHubInfo(user: string) {
  return {
    name: "z3gh0ne",
    model: env.model,
    llm_mode: env.llmMode,
    user,
    channels: [...channels],
    hub_role: "coordination_policy_audit_handoff",
    primary_developer_agent: "external local CLI agent"
  };
}

export async function listHubChannels() {
  const hubDir = path.join(env.dataDir, "hub");
  const result = [];

  for (const channel of channels) {
    const filePath = path.join(hubDir, channel, "messages.jsonl");
    let count = 0;
    let lastTs: string | null = null;
    try {
      const lines = (await readFile(filePath, "utf8")).split(/\r?\n/).filter(Boolean);
      count = lines.length;
      const lastLine = lines.at(-1);
      if (lastLine) {
        lastTs = (JSON.parse(lastLine) as { ts?: string }).ts ?? null;
      }
    } catch {
      count = 0;
    }
    result.push({ channel, message_count: count, last_message_ts: lastTs });
  }

  return { channels: result };
}

export async function sendHubMessage(req: HubMessageInput, user: string) {
  const message = {
    id: randomUUID(),
    ts: new Date().toISOString(),
    from: user,
    channel: req.channel,
    message: req.message,
    metadata: req.metadata
  };
  const dirPath = path.join(env.dataDir, "hub", req.channel);
  await ensureDir(dirPath);
  appendFileSync(path.join(dirPath, "messages.jsonl"), `${JSON.stringify(message)}\n`, "utf8");
  await audit("hub_message", { user, channel: req.channel, message_id: message.id });
  return message;
}

export async function listHubMessages(channel: string, query: HubMessageQuery = {}) {
  if (!channels.includes(channel as Channel)) {
    throw new HttpError(400, "invalid channel");
  }

  const limit = clampLimit(query.limit);
  const filePath = path.join(env.dataDir, "hub", channel, "messages.jsonl");

  let lines: string[];
  try {
    lines = (await readFile(filePath, "utf8")).split(/\r?\n/).filter(Boolean);
  } catch {
    return { channel, messages: [], total: 0 };
  }

  const messages: Array<Record<string, unknown>> = [];
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line) {
      continue;
    }
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      if (query.sender && parsed.from !== query.sender) {
        continue;
      }
      if (query.msg_type && (parsed.metadata as Record<string, unknown> | undefined)?.type !== query.msg_type) {
        continue;
      }
      if (query.since && typeof parsed.ts === "string" && parsed.ts < query.since) {
        break;
      }
      messages.push(parsed);
      if (messages.length >= limit) {
        break;
      }
    } catch {
      continue;
    }
  }

  messages.reverse();
  return { channel, messages, total: messages.length };
}

function clampLimit(limit: number | string | undefined) {
  const parsed = typeof limit === "number" ? limit : Number.parseInt(limit ?? "50", 10);
  if (Number.isNaN(parsed)) {
    return 50;
  }
  return Math.min(200, Math.max(1, parsed));
}
