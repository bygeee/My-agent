import type { StoredTask } from "../services/tasks.js";

export type PromptContext = {
  task: StoredTask;
};

export type PromptSection = {
  id: string;
  title: string;
  body: string[];
};
