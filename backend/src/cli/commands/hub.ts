import { parseOrThrow } from "../../lib/http.js";
import { hubMessageSchema } from "../../types/hub.js";
import { getHubInfo, listHubChannels, listHubMessages, sendHubMessage } from "../../services/hub.js";
import type { ParsedArgs } from "../types.js";
import { CliError } from "../types.js";
import { flagBool, flagString, requirePositional } from "../args.js";
import { printJson, printTable } from "../output.js";

export async function runHubCommand(parsed: ParsedArgs, user: string) {
  const [, action] = parsed.positionals;
  switch (action) {
    case "info":
      printJson(getHubInfo(user));
      return;
    case "channels": {
      const result = await listHubChannels();
      if (flagBool(parsed, "json")) {
        printJson(result);
      } else {
        printTable(result.channels, [
          { key: "channel", header: "channel", max: 16 },
          { key: "message_count", header: "messages", max: 10 },
          { key: "last_message_ts", header: "last_message_ts", max: 30 }
        ]);
      }
      return;
    }
    case "send": {
      const message = flagString(parsed, "message") ?? parsed.positionals.slice(2).join(" ").trim();
      const channel = flagString(parsed, "channel") ?? "default";
      const metadata = parseMetadata(flagString(parsed, "metadata") ?? flagString(parsed, "metadata-json"));
      const req = parseOrThrow(hubMessageSchema, { channel, message, metadata });
      printJson(await sendHubMessage(req, user));
      return;
    }
    case "read": {
      const channel = requirePositional(parsed, 2, "hub read requires a channel");
      const result = await listHubMessages(channel, {
        limit: flagString(parsed, "limit"),
        sender: flagString(parsed, "sender"),
        msg_type: flagString(parsed, "type") ?? flagString(parsed, "msg-type"),
        since: flagString(parsed, "since")
      });
      printJson(result);
      return;
    }
    default:
      throw new CliError("hub command must be one of: info, channels, send, read");
  }
}

function parseMetadata(raw: string | undefined) {
  if (!raw) {
    return {};
  }
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CliError("--metadata must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}
