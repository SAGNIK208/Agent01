import { tool } from "ai";
import { z } from "zod";
import MailComposer from "nodemailer/lib/mail-composer";
import type { ConfirmDraft } from "../../agent/confirm";
import { getDraft } from "../../agent/state";
import { corsair } from "../../connectors/corsair";

export function sendEmail(confirmDraft: ConfirmDraft) {
  return tool({
    description:
      "Show a saved email draft, request user confirmation, then send it through Gmail.",

    inputSchema: z.object({
      draftId: z.string().min(1),
    }),

    execute: async ({ draftId }) => {
      const draft = getDraft(draftId);

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
          reason: "Set GMAIL_FROM to your connected Gmail address in .env.",
        };
      }

      // Snapshot the exact values that will be reviewed and sent.
      const message = {
        from,
        to: draft.to,
        subject: draft.subject,
        text: draft.body,
      };

      const mime = await new MailComposer(message).compile().build();
      const raw = mime.toString("base64url");

      const decision = await confirmDraft(
        draft,
        [
          "Email",
          `From: ${message.from}`,
          `To: ${message.to}`,
          `Subject: ${message.subject}`,
          "",
          message.text,
        ].join("\n"),
      );

      if (decision.status !== "approved") return decision;

      try {
        const result = await corsair.gmail.api.messages.send({
          userId: "me",
          raw,
        });

        if (!result.id) {
          return {
            status: "unknown",
            draftId,
            reason:
              "No message ID was returned. Check Gmail Sent before attempting another send.",
          };
        }

        return {
          status: "sent",
          connector: "mail",
          draftId,
          messageId: result.id,
          to: message.to,
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
            "The send could not be confirmed. Check Gmail Sent before attempting another send. Do not retry automatically.",
        };
      }
    },
  });
}