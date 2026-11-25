import { strict as assert } from "node:assert";
import { test } from "node:test";
import { getDraft, getLatestDraft, listDrafts, saveDraft } from "./state";
import { createSendEmailTool } from "../tools/mail/send-mail";
import { createSendChatMessageTool } from "../tools/slack/send-message";
import { createMailDraftTools } from "../tools/mail/draft-mail";
import { draftChatMessage, draftChatReply } from "../tools/slack/draft-message";
import { registerBriefingTargets } from "../briefing";
import type { SendChatParams, SendMailParams } from "../connectors/communication/contracts";

test("drafts state management and fallback resolution", async () => {
  process.env.GMAIL_FROM = "sender@example.com";
  const mailDraft = saveDraft({
    id: "uuid-mail-1",
    connector: "mail",
    to: "test@example.com",
    subject: "Test Subject",
    body: "Test Body",
    approved: false,
  });

  const chatDraft = saveDraft({
    id: "uuid-chat-1",
    connector: "chat",
    channel: "C12345",
    body: "Chat Body",
    approved: false,
  });

  assert.equal(getDraft("uuid-mail-1"), mailDraft);
  assert.equal(getDraft("uuid-chat-1"), chatDraft);
  assert.equal(getLatestDraft("mail"), mailDraft);
  assert.equal(getLatestDraft("chat"), chatDraft);

  // Fallback in sendEmail when passing an item reference like 'item-3'
  let confirmedMail = false;
  let sentMail = false;

  const sendEmail = createSendEmailTool(
    {
      send: async () => {
        sentMail = true;
        return { messageId: "sent-msg-1" };
      },
    },
    async (draft) => {
      confirmedMail = true;
      assert.equal(draft.id, "uuid-mail-1");
      draft.approved = true;
      return { status: "approved" as const };
    },
  );

  const mailResult = (await (sendEmail as any).execute({
    draftId: "item-3",
  })) as any;

  assert.equal(confirmedMail, true);
  assert.equal(sentMail, true);
  assert.equal(mailResult.status, "sent");

  // Fallback in sendChatMessage when passing an item reference like 'item-4'
  let confirmedChat = false;
  let sentChat = false;

  const sendChat = createSendChatMessageTool(
    {
      send: async () => {
        sentChat = true;
        return { messageId: "1700000000.001" };
      },
    },
    async (draft) => {
      confirmedChat = true;
      assert.equal(draft.id, "uuid-chat-1");
      draft.approved = true;
      return { status: "approved" as const };
    },
  );

  const chatResult = (await (sendChat as any).execute({
    draftId: "item-4",
  })) as any;

  assert.equal(confirmedChat, true);
  assert.equal(sentChat, true);
  assert.equal(chatResult.status, "sent");
});

test("email and chat drafts support replying in threads from briefing context", async () => {
  process.env.GMAIL_FROM = "agent@example.com";

  registerBriefingTargets(
    new Map([
      [
        "item-10",
        {
          provider: "gmail",
          connectionId: "default",
          itemId: "msg-10-id",
          containerId: "thread-10-id",
          sender: "Alice Smith <alice@example.com>",
        },
      ],
      [
        "item-20",
        {
          provider: "slack",
          connectionId: "default",
          itemId: "1710000000.999",
          containerId: "C0123456789",
          authorId: "U01234567",
        },
      ],
    ]),
  );

  const { draftEmailReply } = createMailDraftTools({
    getMessage: async (messageId) => {
      if (messageId === "msg-10-id") {
        return {
          id: "msg-10-id",
          threadId: "thread-10-id",
          subject: "Q4 Cloud Migration Budget",
          from: "Alice Smith <alice@example.com>",
          messageIdHeader: "<parent-msg-id@mail.gmail.com>",
          referencesHeader: "<older-msg-id@mail.gmail.com>",
        };
      }
      return null;
    },
  });

  // 1. Test draftEmailReply
  const emailReplyResult = (await (draftEmailReply as any).execute({
    replyTo: "item-10",
    body: "Approved the deployment.",
  })) as any;

  assert.equal(emailReplyResult.status, "drafted");
  assert.equal(emailReplyResult.to, "alice@example.com");
  assert.equal(emailReplyResult.subject, "Re: Q4 Cloud Migration Budget");
  assert.equal(emailReplyResult.isReply, true);
  assert.equal(emailReplyResult.threadId, "thread-10-id");
  assert.equal(emailReplyResult.inReplyTo, "<parent-msg-id@mail.gmail.com>");

  // Verify draftEmailReply stops when parent cannot be resolved
  const missingParentResult = (await (draftEmailReply as any).execute({
    replyTo: "non-existent-id",
    body: "Should fail",
  })) as any;
  assert.equal(missingParentResult.status, "error");

  // Verify sendEmail passes threadId and inReplyTo
  let capturedMailParams: SendMailParams | undefined;
  let confirmedMailPrompt = "";

  const sendEmail = createSendEmailTool(
    {
      send: async (params) => {
        capturedMailParams = params;
        return { messageId: "reply-sent-1" };
      },
    },
    async (draft, prompt) => {
      confirmedMailPrompt = prompt;
      return { status: "approved" as const };
    },
  );

  const mailSendResult = (await (sendEmail as any).execute({
    draftId: emailReplyResult.draftId,
  })) as any;

  assert.equal(mailSendResult.status, "sent");
  assert.match(confirmedMailPrompt, /Reply in thread/);
  assert.match(confirmedMailPrompt, /Re: Q4 Cloud Migration Budget/);
  assert.match(confirmedMailPrompt, /thread-10-id/);
  assert.equal(capturedMailParams?.threadId, "thread-10-id");
  assert.equal(capturedMailParams?.inReplyTo, "<parent-msg-id@mail.gmail.com>");
  assert.equal(capturedMailParams?.references, "<older-msg-id@mail.gmail.com>");

  // 2. Test draftChatReply
  const chatReplyResult = (await (draftChatReply as any).execute({
    replyTo: "item-20",
    body: "LGTM!",
  })) as any;

  assert.equal(chatReplyResult.status, "drafted");
  assert.equal(chatReplyResult.channel, "C0123456789");
  assert.equal(chatReplyResult.isReply, true);
  assert.equal(chatReplyResult.threadTs, "1710000000.999");

  // Verify sendChatMessage passes threadTs
  let capturedChatParams: SendChatParams | undefined;
  let confirmedChatPrompt = "";

  const sendChat = createSendChatMessageTool(
    {
      send: async (params) => {
        capturedChatParams = params;
        return { messageId: "chat-reply-ts" };
      },
    },
    async (draft, prompt) => {
      confirmedChatPrompt = prompt;
      return { status: "approved" as const };
    },
  );

  const chatSendResult = (await (sendChat as any).execute({
    draftId: chatReplyResult.draftId,
  })) as any;

  assert.equal(chatSendResult.status, "sent");
  assert.match(confirmedChatPrompt, /Thread reply/);
  assert.match(confirmedChatPrompt, /1710000000\.999/);
  assert.equal(capturedChatParams?.conversationId, "C0123456789");
  assert.equal(capturedChatParams?.threadTs, "1710000000.999");
});
