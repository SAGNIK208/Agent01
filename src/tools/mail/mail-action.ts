import { tool } from "ai";
import { z } from "zod";
import type { Confirm } from "../../agent/confirm";
import { resolveBriefingMessageId } from "../../briefing";
import type { MailActions } from "../../connectors/communication/contracts";

const messageIdSchema = z.object({
  messageId: z
    .string()
    .trim()
    .min(1)
    .describe("Gmail message ID or briefing item reference (e.g. 'item-1')"),
});

const labelChangeSchema = z.object({
  messageId: z
    .string()
    .trim()
    .min(1)
    .describe("Gmail message ID or briefing item reference (e.g. 'item-1')"),
  addLabelIds: z.array(z.string().trim().min(1)).default([]),
  removeLabelIds: z.array(z.string().trim().min(1)).default([]),
});

export function createMailActionTools(deps: {
  mailActions: MailActions;
  confirm: Confirm;
}) {
  const { mailActions, confirm } = deps;

  async function requireConfirmation<T>(
    preview: string,
    executeAction: () => Promise<T>,
  ): Promise<T | { status: "declined"; reason: string }> {
    const approved = await confirm(preview);
    if (!approved) {
      return {
        status: "declined",
        reason: "User declined the action.",
      };
    }
    return executeAction();
  }

  return {
    archiveMailMessage: tool({
      description:
        "Archive one mail message. Accepts a Gmail message ID or briefing item ref (e.g. 'item-1'). Requires explicit user approval.",
      inputSchema: messageIdSchema,
      execute: ({ messageId }) => {
        const targetId = resolveBriefingMessageId(messageId);
        return requireConfirmation(
          `Mail Action: Archive message ${targetId}`,
          () => mailActions.archiveMessage({ messageId: targetId }),
        );
      },
    }),

    markMailMessageRead: tool({
      description:
        "Mark one mail message as read. Accepts a Gmail message ID or briefing item ref (e.g. 'item-1').",
      inputSchema: messageIdSchema,
      execute: ({ messageId }) =>
        mailActions.markAsRead({
          messageId: resolveBriefingMessageId(messageId),
        }),
    }),

    markMailMessageUnread: tool({
      description:
        "Mark one mail message as unread. Accepts a Gmail message ID or briefing item ref (e.g. 'item-1').",
      inputSchema: messageIdSchema,
      execute: ({ messageId }) =>
        mailActions.markAsUnread({
          messageId: resolveBriefingMessageId(messageId),
        }),
    }),

    starMailMessage: tool({
      description:
        "Star one mail message. Accepts a Gmail message ID or briefing item ref (e.g. 'item-1').",
      inputSchema: messageIdSchema,
      execute: ({ messageId }) =>
        mailActions.starMessage({
          messageId: resolveBriefingMessageId(messageId),
        }),
    }),

    unstarMailMessage: tool({
      description:
        "Remove the star from one mail message. Accepts a Gmail message ID or briefing item ref (e.g. 'item-1').",
      inputSchema: messageIdSchema,
      execute: ({ messageId }) =>
        mailActions.unstarMessage({
          messageId: resolveBriefingMessageId(messageId),
        }),
    }),

    trashMailMessage: tool({
      description:
        "Move one mail message to trash. Accepts a Gmail message ID or briefing item ref (e.g. 'item-1'). Requires explicit user approval.",
      inputSchema: messageIdSchema,
      execute: ({ messageId }) => {
        const targetId = resolveBriefingMessageId(messageId);
        return requireConfirmation(
          `Mail Action: Move message ${targetId} to trash`,
          () => mailActions.trashMessage({ messageId: targetId }),
        );
      },
    }),

    untrashMailMessage: tool({
      description:
        "Restore one mail message from trash. Accepts a Gmail message ID or briefing item ref (e.g. 'item-1').",
      inputSchema: messageIdSchema,
      execute: ({ messageId }) =>
        mailActions.untrashMessage({
          messageId: resolveBriefingMessageId(messageId),
        }),
    }),

    modifyMailMessageLabels: tool({
      description:
        "Add or remove mail labels on one message. Accepts a Gmail message ID or briefing item ref (e.g. 'item-1').",
      inputSchema: labelChangeSchema,
      execute: (input) =>
        mailActions.modifyLabels({
          ...input,
          messageId: resolveBriefingMessageId(input.messageId),
        }),
    }),
  };
}