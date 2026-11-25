import type { LanguageModel } from "ai";
import { createDraftConfirmation, type Confirm } from "../agent/confirm";
import { corsair } from "../connectors/corsair";
import { createGmailReader, createGmailSender, createGmailMailActions } from "../connectors/communication/gmail";
import { createSlackReader, createSlackSender } from "../connectors/communication/slack";
import { createCommunicationReadTools } from "./communication/read-tool";
import { createMailDraftTools } from "./mail/draft-mail";
import { createSendEmailTool } from "./mail/send-mail";
import { draftChatMessage, draftChatReply } from "./slack/draft-message";
import { createSendChatMessageTool } from "./slack/send-message";
import { createMailActionTools } from "./mail/mail-action";
import { createDailyBriefingTool } from "./communication/daily-briefing";
import { viewDraft } from "./communication/get-draft";
import { createConfiguredDailyBriefing } from "../agent/daily-briefing";
import { createGoogleCalendarReader } from "../connectors/communication/gcal";
import { createCalendarActionTools } from "./calendar/calendar-action";

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
const { draftEmail, draftEmailReply } = createMailDraftTools(mailReader);

const calendarReader = createGoogleCalendarReader({
  events: corsair.googlecalendar.api.events,
  calendar: corsair.googlecalendar.api.calendar,
});

export function getTools(confirm: Confirm, model?: LanguageModel) {
  const confirmDraft = createDraftConfirmation(confirm);
  const mailActionTools = createMailActionTools({
    mailActions,
    confirm,
  });
  const calendarTools = createCalendarActionTools(calendarReader, confirm);

  return {
    ...communicationReadTools,
    ...calendarTools,
    draftEmail,
    draftEmailReply,
    draftChatMessage,
    draftChatReply,
    viewDraft,
    sendEmail: createSendEmailTool(mailSender, confirmDraft),
    sendChatMessage: createSendChatMessageTool(chatSender, confirmDraft),
    ...(model ? { getDailyBriefing: createDailyBriefingTool(createConfiguredDailyBriefing(model, calendarReader)) } : {}),
    ...mailActionTools,
  };
}