import { tool } from "ai";
import { z } from "zod";
import type { ConfirmDraft } from "../../agent/confirm";
import { getDraft, getLatestDraft } from "../../agent/state";
import type { ChatSender } from "../../connectors/communication/contracts";

export function createSendChatMessageTool(chatSender: ChatSender, confirmDraft: ConfirmDraft) {
  return tool({
    description:
      "Show a saved chat draft, request user confirmation, then post it. Requires an explicit conversation ID.",

    inputSchema: z.object({
      draftId: z
        .string()
        .min(1)
        .describe("The draft ID returned by draftChatMessage, or 'latest' to send the most recent chat draft."),
    }),

    execute: async ({ draftId }) => {
      const draft = getDraft(draftId) ?? getLatestDraft("chat");

      if (
        !draft ||
        draft.connector !== "chat" ||
        !draft.channel ||
        !draft.body.trim()
      ) {
        return {
          status: "error",
          reason: "Valid chat draft not found.",
        };
      }

      if (!/^[CGD][A-Z0-9]+$/.test(draft.channel)) {
        return {
          status: "blocked",
          reason:
            "Provide the exact channel/conversation ID for now, not a channel name. Create a new draft with that ID.",
        };
      }

      const channel = draft.channel;
      const text = draft.body;

      const decision = await confirmDraft(
        draft,
        `Chat\nChannel/Conversation ID: ${channel}\n\n${text}`,
      );

      if (decision.status !== "approved") return decision;

      try {
        const result = await chatSender.send({
          conversationId: channel,
          body: text,
        });

        return {
          status: "sent",
          connector: "chat",
          draftId,
          channel,
          messageTimestamp: result.messageId,
        };
      } catch (error) {
        console.error(
          "[sendChatMessage]",
          error instanceof Error ? error.message : String(error),
        );

        return {
          status: "unknown",
          draftId,
          reason:
            "The post could not be confirmed. Check the chat conversation before attempting another send. Do not retry automatically.",
        };
      }
    },
  });
}