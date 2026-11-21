import { randomUUID } from "node:crypto";
import { tool } from "ai";
import { z } from "zod";
import { saveDraft } from "../../agent/state";

export const draftChatMessage = tool({
  description: "Create a local chat message draft (e.g. Slack). Does not post it.",
  inputSchema: z.object({
    channel: z.string().trim().min(1),
    body: z.string().trim().min(1),
  }),
  execute: async ({ channel, body }) => {
    const draft = saveDraft({
      id: randomUUID(),
      connector: "chat",
      channel,
      body,
      approved: false,
    });

    return { draftId: draft.id, channel, body };
  },
});