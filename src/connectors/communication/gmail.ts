import MailComposer from "nodemailer/lib/mail-composer";
import type { corsair } from "../corsair";
import type {
  MailAction,
  MailActionResult,
  MailActions,
  MailLabelChangeInput,
  MailLabelChangeResult,
  MailMessageActionInput,
  MailReader,
  MailSender,
  SendMailParams,
  SendMailResult,
} from "./contracts";

type CorsairGmailMessages = typeof corsair.gmail.api.messages;

type GmailReaderApi = Pick<CorsairGmailMessages, "list">;
type GmailSenderApi = Pick<CorsairGmailMessages, "send">;
type GmailActionsApi = Pick<CorsairGmailMessages, "modify" | "trash" | "untrash">;

export function createGmailReader(api: GmailReaderApi): MailReader {
  return {
    async listMessages({ limit, cursor }) {
      const result = await api.list({
        userId: "me",
        maxResults: limit,
        ...(cursor ? { pageToken: cursor } : {}),
      });

      return {
        items: (result.messages ?? []).map((message) => {
          if (!message.id) {
            throw new Error("Gmail list returned a message without an ID");
          }

          return {
            id: message.id,
            ...(message.threadId ? { threadId: message.threadId } : {}),
          };
        }),
        ...(result.nextPageToken
          ? { nextCursor: result.nextPageToken }
          : {}),
      };
    },
  };
}

export function createGmailSender(api: GmailSenderApi): MailSender {
  return {
    async send({ to, subject, body }: SendMailParams): Promise<SendMailResult> {
      const from = process.env.GMAIL_FROM;
      if (!from) {
        throw new Error("Set GMAIL_FROM to your connected Gmail address in .env.");
      }

      const message = {
        from,
        to,
        subject,
        text: body,
      };

      const mime = await new MailComposer(message).compile().build();
      const raw = mime.toString("base64url");

      const result = await api.send({
        userId: "me",
        raw,
      });

      if (!result.id) {
        throw new Error("No message ID was returned from Gmail API.");
      }

      return { messageId: result.id };
    },
  };
}

const GMAIL_LABELS = {
  inbox: "INBOX",
  unread: "UNREAD",
  starred: "STARRED",
} as const;

function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function createGmailMailActions(
  api: GmailActionsApi,
): MailActions {
  async function applyLabels(
    input: MailLabelChangeInput,
  ): Promise<MailLabelChangeResult> {
    try {
      const result = await api.modify({
        userId: "me",
        id: input.messageId,
        addLabelIds: input.addLabelIds,
        removeLabelIds: input.removeLabelIds,
      });

      return {
        status: "applied",
        messageId: result.id ?? input.messageId,
        addLabelIds: input.addLabelIds,
        removeLabelIds: input.removeLabelIds,
      };
    } catch (error) {
      return {
        status: "failed",
        messageId: input.messageId,
        addLabelIds: input.addLabelIds,
        removeLabelIds: input.removeLabelIds,
        error: normalizeError(error),
      };
    }
  }

  async function runLabelAction(
    input: MailMessageActionInput,
    action: Extract<
      MailAction,
      "archive" | "mark_read" | "mark_unread" | "star" | "unstar"
    >,
  ): Promise<MailActionResult> {
    const labelChanges: Record<
      typeof action,
      { addLabelIds: string[]; removeLabelIds: string[] }
    > = {
      archive: {
        addLabelIds: [],
        removeLabelIds: [GMAIL_LABELS.inbox],
      },
      mark_read: {
        addLabelIds: [],
        removeLabelIds: [GMAIL_LABELS.unread],
      },
      mark_unread: {
        addLabelIds: [GMAIL_LABELS.unread],
        removeLabelIds: [],
      },
      star: {
        addLabelIds: [GMAIL_LABELS.starred],
        removeLabelIds: [],
      },
      unstar: {
        addLabelIds: [],
        removeLabelIds: [GMAIL_LABELS.starred],
      },
    };

    const result = await applyLabels({
      messageId: input.messageId,
      ...labelChanges[action],
    });

    return {
      status: result.status,
      messageId: result.messageId,
      action,
      ...(result.error ? { error: result.error } : {}),
    };
  }

  return {
    archiveMessage: (input) =>
      runLabelAction(input, "archive"),

    markAsRead: (input) =>
      runLabelAction(input, "mark_read"),

    markAsUnread: (input) =>
      runLabelAction(input, "mark_unread"),

    starMessage: (input) =>
      runLabelAction(input, "star"),

    unstarMessage: (input) =>
      runLabelAction(input, "unstar"),

    modifyLabels: applyLabels,

    async trashMessage(input) {
      try {
        const result = await api.trash({
          userId: "me",
          id: input.messageId,
        });

        return {
          status: "applied",
          messageId: result.id ?? input.messageId,
          action: "trash",
        };
      } catch (error) {
        return {
          status: "failed",
          messageId: input.messageId,
          action: "trash",
          error: normalizeError(error),
        };
      }
    },

    async untrashMessage(input) {
      try {
        const result = await api.untrash({
          userId: "me",
          id: input.messageId,
        });

        return {
          status: "applied",
          messageId: result.id ?? input.messageId,
          action: "untrash",
        };
      } catch (error) {
        return {
          status: "failed",
          messageId: input.messageId,
          action: "untrash",
          error: normalizeError(error),
        };
      }
    },
  };
}