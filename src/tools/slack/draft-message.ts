import { randomUUID } from "node:crypto";
import { tool } from "ai";
import { z } from "zod";
import { saveDraft } from "../../agent/state";
import { resolveBriefingChannelId } from "../../briefing";

export const draftChatMessage = tool({
  description:
    "Create a local chat message draft (e.g. Slack). Accepts a channel ID or briefing item ref (e.g. 'item-2'). Does not post it.",
  inputSchema: z.object({
    channel: z
      .string()
      .trim()
      .min(1)
      .describe("Slack channel ID or briefing item reference (e.g. 'item-2')"),
    body: z.string().trim().min(1),
  }),
  execute: async ({ channel, body }) => {
    const targetChannel = resolveBriefingChannelId(channel);
    const draft = saveDraft({
      id: randomUUID(),
      connector: "chat",
      channel: targetChannel,
      body,
      approved: false,
    });

    return { draftId: draft.id, channel: targetChannel, body };
  },
});