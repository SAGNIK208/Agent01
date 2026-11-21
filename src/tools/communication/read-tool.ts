import { randomUUID } from "node:crypto";
import { tool } from "ai";
import { z } from "zod";
import type {
  ChatReader,
  MailReader,
} from "../../connectors/communication/contracts";

const pageSchema = z.object({
  limit: z.number().int().min(1).max(50).default(10),
  cursor: z.string().min(1).optional(),
});

async function runRead<T>(operation: string, read: () => Promise<T>) {
  const requestId = randomUUID();
  const startedAt = Date.now();

  try {
    const data = await read();
    console.info("[connector.read]", {
      requestId,
      operation,
      status: "ok",
      durationMs: Date.now() - startedAt,
    });
    return { status: "ok" as const, requestId, data };
  } catch (error) {
    console.warn("[connector.read]", {
      requestId,
      operation,
      status: "failed",
      durationMs: Date.now() - startedAt,
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return { status: "failed" as const, requestId, operation };
  }
}

export function createCommunicationReadTools(deps: {
  mail: MailReader;
  chat: ChatReader;
}) {
  return {
    listMailMessages: tool({
      description: "List mail message IDs. Does not fetch message bodies.",
      inputSchema: pageSchema,
      execute: (input) =>
        runRead("mail.listMessages", () => deps.mail.listMessages(input)),
    }),
    listChatMessages: tool({
      description: "Read one page of chat history for a known conversation ID.",
      inputSchema: pageSchema.extend({
        conversationId: z.string().trim().min(1),
      }),
      execute: (input) =>
        runRead("chat.listMessages", () => deps.chat.listMessages(input)),
    }),
  };
}