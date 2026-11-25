import type { corsair } from "../corsair";
import type { ChatReader, ChatSender, SendChatParams, SendChatResult } from "./contracts";

type SlackChannelsApi = Pick<
  typeof corsair.slack.api.channels,
  "getHistory"
>;

type SlackMessagesApi = Pick<
  typeof corsair.slack.api.messages,
  "post"
>;

export function createSlackReader(api: SlackChannelsApi): ChatReader {
  return {
    async listMessages({ conversationId, limit, cursor }) {
      const result = await api.getHistory({
        channel: conversationId,
        limit,
        ...(cursor ? { cursor } : {}),
      });

      if (!result.ok) {
        throw new Error(`Slack history rejected: ${result.error ?? "unknown"}`);
      }

      const nextCursor = result.response_metadata?.next_cursor?.trim();

      return {
        items: (result.messages ?? []).map((message) => {
          if (!message.ts) {
            throw new Error("Slack history returned a message without a timestamp");
          }

          return {
            id: message.ts,
            conversationId,
            ...(typeof message.text === "string" ? { text: message.text } : {}),
            ...(message.user ? { authorId: message.user } : {}),
          };
        }),
        ...(nextCursor ? { nextCursor } : {}),
      };
    },
  };
}

export function createSlackSender(api: SlackMessagesApi): ChatSender {
  return {
    async send({ conversationId, body, threadTs }: SendChatParams): Promise<SendChatResult> {
      const result = await api.post({
        channel: conversationId,
        text: body,
        ...(threadTs ? { thread_ts: threadTs } : {}),
      });

      if (!result.ok || !result.ts) {
        throw new Error(`Slack post rejected: ${result.error ?? "unknown"}`);
      }

      return { messageId: result.ts };
    },
  };
}