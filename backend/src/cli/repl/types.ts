import type { StoredTask } from "../../services/tasks.js";

export type ReplState = {
  task: StoredTask;
  user: string;
  verbose: boolean;
};

export type SlashCommandContext = {
  state: ReplState;
  args: string;
  output: NodeJS.WriteStream;
};

export type SlashCommand = {
  name: string;
  aliases?: string[];
  usage: string;
  description: string;
  run(context: SlashCommandContext): Promise<"exit" | "continue"> | "exit" | "continue";
};
