import type { PromptContext } from "./types.js";
import { buildClaudeCodePromptSections, listClaudeCodePromptSections } from "./claude-code.js";

export function buildSystemPrompt(context: PromptContext) {
  return buildClaudeCodePromptSections(context)
    .map((section) => [
      `## ${section.title}`,
      ...section.body.map((line) => `- ${line}`)
    ].join("\n"))
    .join("\n\n");
}

export function listPromptSections() {
  return listClaudeCodePromptSections();
}
