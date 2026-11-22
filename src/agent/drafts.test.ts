import { strict as assert } from "node:assert";
import { test } from "node:test";
import { getDraft, getLatestDraft, listDrafts, saveDraft } from "./state";
import { createSendEmailTool } from "../tools/mail/send-mail";
import { createSendChatMessageTool } from "../tools/slack/send-message";

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
