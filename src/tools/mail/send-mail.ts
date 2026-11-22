import { tool } from "ai";
import { z } from "zod";
import type { ConfirmDraft } from "../../agent/confirm";
import { getDraft, getLatestDraft } from "../../agent/state";
import type { MailSender } from "../../connectors/communication/contracts";

export function createSendEmailTool(mailSender: MailSender, confirmDraft: ConfirmDraft) {
  return tool({
    description:
      "Show a saved email draft, request user confirmation, then send it through email.",

    inputSchema: z.object({
      draftId: z
        .string()
        .min(1)
        .describe("The draft ID returned by draftEmail, or 'latest' to send the most recent email draft."),
    }),

    execute: async ({ draftId }) => {
      const draft = getDraft(draftId) ?? getLatestDraft("mail");

      if (
        !draft ||
        draft.connector !== "mail" ||
        !draft.to ||
        !draft.subject ||
        !draft.body.trim()
      ) {
        return {
          status: "error",
          reason: "Valid email draft not found.",
        };
      }

      const from = process.env.GMAIL_FROM;

      if (!from || !z.string().email().safeParse(from).success) {
        return {
          status: "error",
          reason: "Set GMAIL_FROM to your connected email address in .env.",
        };
      }

      const decision = await confirmDraft(
        draft,
        [
          "Email",
          `From: ${from}`,
          `To: ${draft.to}`,
          `Subject: ${draft.subject}`,
          "",
          draft.body,
        ].join("\n"),
      );

      if (decision.status !== "approved") return decision;

      try {
        const result = await mailSender.send({
          to: draft.to,
          subject: draft.subject,
          body: draft.body,
        });

        if (!result.messageId) {
          return {
            status: "unknown",
            draftId,
            reason:
              "No message ID was returned. Check Sent folder before attempting another send.",
          };
        }

        return {
          status: "sent",
          connector: "mail",
          draftId,
          messageId: result.messageId,
          to: draft.to,
        };
      } catch (error) {
        console.error(
          "[sendEmail]",
          error instanceof Error ? error.message : String(error),
        );

        return {
          status: "unknown",
          draftId,
          reason:
            "The send could not be confirmed. Check Sent folder before attempting another send. Do not retry automatically.",
        };
      }
    },
  });
}