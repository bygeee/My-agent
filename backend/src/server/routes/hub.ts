import type { AppInstance } from "../../server.js";
import { parseOrThrow } from "../../lib/http.js";
import { requireToken } from "../../core/auth.js";
import { hubMessageSchema } from "../../types/hub.js";
import { getHubInfo, listHubChannels, listHubMessages, sendHubMessage } from "../../services/hub.js";

export function registerHubRoutes(app: AppInstance) {
  app.get("/hub/info", async (request) => {
    const user = requireToken(request);
    return getHubInfo(user);
  });

  app.get("/hub/channels", async (request) => {
    requireToken(request);
    return listHubChannels();
  });

  app.post("/hub/messages", async (request) => {
    const user = requireToken(request);
    const req = parseOrThrow(hubMessageSchema, request.body);
    return sendHubMessage(req, user);
  });

  app.get("/hub/messages/:channel", async (request) => {
    requireToken(request);
    const { channel } = request.params as { channel: string };
    const query = request.query as Record<string, string | undefined>;
    return listHubMessages(channel, {
      limit: query.limit,
      sender: query.sender,
      msg_type: query.msg_type,
      since: query.since
    });
  });
}
