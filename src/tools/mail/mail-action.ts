import { tool } from "ai";
import { z } from "zod";
import type { Confirm } from "../../agent/confirm";
import type { MailActions } from "../../connectors/communication/contracts";

const messageIdSchema = z.object({
  messageId: z.string().trim().min(1),
});

const labelChangeSchema = z.object({
  messageId: z.string().trim().min(1),
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
        "Archive one mail message. Requires explicit user approval.",
      inputSchema: messageIdSchema,
      execute: ({ messageId }) =>
        requireConfirmation(
          `Mail Action: Archive message ${messageId}`,
          () => mailActions.archiveMessage({ messageId }),
        ),
    }),

    markMailMessageRead: tool({
      description: "Mark one mail message as read.",
      inputSchema: messageIdSchema,
      execute: ({ messageId }) =>
        mailActions.markAsRead({ messageId }),
    }),

    markMailMessageUnread: tool({
      description: "Mark one mail message as unread.",
      inputSchema: messageIdSchema,
      execute: ({ messageId }) =>
        mailActions.markAsUnread({ messageId }),
    }),

    starMailMessage: tool({
      description: "Star one mail message.",
      inputSchema: messageIdSchema,
      execute: ({ messageId }) =>
        mailActions.starMessage({ messageId }),
    }),

    unstarMailMessage: tool({
      description: "Remove the star from one mail message.",
      inputSchema: messageIdSchema,
      execute: ({ messageId }) =>
        mailActions.unstarMessage({ messageId }),
    }),

    trashMailMessage: tool({
      description:
        "Move one mail message to trash. Requires explicit user approval.",
      inputSchema: messageIdSchema,
      execute: ({ messageId }) =>
        requireConfirmation(
          `Mail Action: Move message ${messageId} to trash`,
          () => mailActions.trashMessage({ messageId }),
        ),
    }),

    untrashMailMessage: tool({
      description: "Restore one mail message from trash.",
      inputSchema: messageIdSchema,
      execute: ({ messageId }) =>
        mailActions.untrashMessage({ messageId }),
    }),

    modifyMailMessageLabels: tool({
      description: "Add or remove mail labels on one message.",
      inputSchema: labelChangeSchema,
      execute: (input) =>
        mailActions.modifyLabels(input),
    }),
  };
}