import { env } from "./lib/env.js";
import { taskRequestSchema, taskStatusUpdateSchema } from "./types/task.js";
import { hubMessageSchema } from "./types/hub.js";
import { createTask, listTasks, updateTaskStatus } from "./services/tasks.js";
import { getHubInfo, listHubChannels, sendHubMessage } from "./services/hub.js";
import { listTools } from "./services/tools.js";

const user = process.env.Z3GH0NE_ADMIN_USER ?? "agent";

const hub = getHubInfo(user);
const tools = listTools();
const task = await createTask(taskRequestSchema.parse({
  mode: "ctf_challenge",
  prompt: "analyze this binary"
}), user);
const status = await updateTaskStatus(task.task_id, taskStatusUpdateSchema.parse({
  status: "running",
  comment: "started"
}), user);
const taskList = await listTasks({ limit: 5 });
const channels = await listHubChannels();
const message = await sendHubMessage(hubMessageSchema.parse({
  channel: "handoff",
  message: "cli smoke check",
  metadata: { type: "smoke" }
}), user);

console.log(JSON.stringify({
  cliOk: true,
  hubUser: hub.user,
  toolCount: tools.tools.length,
  taskId: task.task_id,
  status: status.status,
  listedTasks: taskList.total,
  channels: channels.channels.length,
  messageId: message.id,
  dataDir: env.dataDir
}));
