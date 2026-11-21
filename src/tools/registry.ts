import { createDraftConfirmation, type Confirm } from "../agent/confirm";
import { corsair } from "../connectors/corsair";
import { createGmailReader, createGmailSender, createGmailMailActions } from "../connectors/communication/gmail";
import { createSlackReader, createSlackSender } from "../connectors/communication/slack";
import { createCommunicationReadTools } from "./communication/read-tool";
import { draftEmail } from "./mail/draft-mail";
import { createSendEmailTool } from "./mail/send-mail";
import { draftChatMessage } from "./slack/draft-message";
import { createSendChatMessageTool } from "./slack/send-message";
import { createMailActionTools } from "./mail/mail-action";

// Strategies wired with Corsair concrete implementations
const mailReader = createGmailReader(corsair.gmail.api.messages);
const mailSender = createGmailSender(corsair.gmail.api.messages);
const mailActions = createGmailMailActions(corsair.gmail.api.messages);

const chatReader = createSlackReader(corsair.slack.api.channels);
const chatSender = createSlackSender(corsair.slack.api.messages);

const communicationReadTools = createCommunicationReadTools({
  mail: mailReader,
  chat: chatReader,
});

export function getTools(confirm: Confirm) {
  const confirmDraft = createDraftConfirmation(confirm);
  const mailActionTools = createMailActionTools({
    mailActions,
    confirm,
  });

  return {
    ...communicationReadTools,
    draftEmail,
    draftChatMessage,
    sendEmail: createSendEmailTool(mailSender, confirmDraft),
    sendChatMessage: createSendChatMessageTool(chatSender, confirmDraft),
    ...mailActionTools,
  };
}