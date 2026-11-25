import { randomUUID } from "node:crypto";
import { tool } from "ai";
import { z } from "zod";
import { saveDraft } from "../../agent/state";
import {
  resolveBriefingChannelId,
  resolveBriefingMessageTs,
  resolveBriefingTarget,
} from "../../briefing";

export const draftChatMessage = tool({
  description:
    "Create a local chat message draft (e.g. Slack). Accepts a channel ID or briefing item ref (e.g. 'item-2'). " +
    "Can post to a channel or reply in a thread via threadTs or replyTo (e.g. 'item-2'). Does not post it.",
  inputSchema: z.object({
    channel: z
      .string()
      .trim()
      .min(1)
      .describe("Slack channel ID or briefing item reference (e.g. 'item-2')"),
    body: z.string().trim().min(1).describe("Chat message text content."),
    replyTo: z
      .string()
      .trim()
      .optional()
      .describe(
        "Optional briefing item reference (e.g. 'item-2') or Slack message timestamp to reply in thread.",
      ),
    threadTs: z
      .string()
      .trim()
      .optional()
      .describe(
        "Optional Slack thread timestamp (thread_ts) to reply in thread.",
      ),
  }),
  execute: async ({ channel: rawChannel, body, replyTo, threadTs }) => {
    let targetChannel = resolveBriefingChannelId(rawChannel);
    let resolvedThreadTs = threadTs;

    // Check if replyTo or rawChannel is a briefing item reference
    const refTarget = resolveBriefingTarget(replyTo ?? rawChannel);
    if (refTarget && refTarget.provider === "slack") {
      targetChannel = refTarget.containerId ?? targetChannel;
      resolvedThreadTs = resolvedThreadTs ?? refTarget.itemId;
    } else if (replyTo) {
      resolvedThreadTs = resolveBriefingMessageTs(replyTo) ?? replyTo;
    }

    const draft = saveDraft({
      id: randomUUID(),
      connector: "chat",
      channel: targetChannel,
      body,
      approved: false,
      threadTs: resolvedThreadTs,
    });

    return {
      draftId: draft.id,
      channel: targetChannel,
      body,
      isReply: Boolean(resolvedThreadTs),
      threadTs: resolvedThreadTs,
    };
  },
});

export const draftChatReply = tool({
  description:
    "Create a local chat message draft as a direct reply in an existing Slack message thread (e.g. from a daily briefing item). Does not post it.",
  inputSchema: z.object({
    replyTo: z
      .string()
      .trim()
      .min(1)
      .describe(
        "Briefing item reference (e.g. 'item-2') or Slack message timestamp being replied to.",
      ),
    body: z.string().trim().min(1).describe("Reply chat message text content."),
    channel: z
      .string()
      .trim()
      .optional()
      .describe(
        "Optional Slack channel ID override (defaults to the channel from the briefing item).",
      ),
  }),
  execute: async ({ replyTo, body, channel: explicitChannel }) => {
    const target = resolveBriefingTarget(replyTo);
    const targetChannel =
      explicitChannel ??
      target?.containerId ??
      resolveBriefingChannelId(replyTo);
    const threadTs = target?.itemId ?? resolveBriefingMessageTs(replyTo);

    if (!targetChannel) {
      return {
        status: "error" as const,
        reason: `Could not determine Slack channel for ${replyTo}. Please specify 'channel'.`,
      };
    }

    const draft = saveDraft({
      id: randomUUID(),
      connector: "chat",
      channel: targetChannel,
      body,
      approved: false,
      threadTs,
    });

    return {
      status: "drafted" as const,
      draftId: draft.id,
      channel: targetChannel,
      body,
      isReply: true,
      threadTs,
    };
  },
});
