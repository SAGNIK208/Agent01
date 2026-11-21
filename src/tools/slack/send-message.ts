import { tool } from "ai";
import { z } from "zod";
import type { ConfirmDraft } from "../../agent/confirm";
import { getDraft } from "../../agent/state";
import { corsair } from "../../connectors/corsair";

export function sendSlackMessage(confirmDraft: ConfirmDraft) {
  return tool({
    description:
      "Show a saved Slack draft, request user confirmation, then post it. Requires an explicit Slack channel or conversation ID.",

    inputSchema: z.object({
      draftId: z.string().min(1),
    }),

    execute: async ({ draftId }) => {
      const draft = getDraft(draftId);

      if (
        !draft ||
        draft.connector !== "slack" ||
        !draft.channel ||
        !draft.body.trim()
      ) {
        return {
          status: "error",
          reason: "Valid Slack draft not found.",
        };
      }

      if (!/^[CGD][A-Z0-9]+$/.test(draft.channel)) {
        return {
          status: "blocked",
          reason:
            "Provide the exact Slack channel/conversation ID for now, not a channel name. Create a new draft with that ID.",
        };
      }

      const channel = draft.channel;
      const text = draft.body;

      const decision = await confirmDraft(
        draft,
        `Slack\nChannel ID: ${channel}\n\n${text}`,
      );

      if (decision.status !== "approved") return decision;

      try {
        const result = await corsair.slack.api.messages.post({
          channel,
          text,
          mrkdwn: false,
          unfurl_links: false,
          unfurl_media: false,
        });

        if (!result.ok) {
          return {
            status: "error",
            connector: "slack",
            draftId,
            reason: result.error ?? "Slack rejected the message.",
          };
        }

        return {
          status: "sent",
          connector: "slack",
          draftId,
          channel: result.channel ?? channel,
          messageTimestamp: result.ts,
        };
      } catch (error) {
        console.error(
          "[sendSlackMessage]",
          error instanceof Error ? error.message : String(error),
        );

        return {
          status: "unknown",
          draftId,
          reason:
            "The post could not be confirmed. Check the Slack conversation before attempting another send. Do not retry automatically.",
        };
      }
    },
  });
}