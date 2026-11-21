import { createDraftConfirmation, type Confirm } from "../agent/confirm";
import { draftEmail } from "./mail/draft-mail";
import { sendEmail } from "./mail/send-mail";
import { draftSlackMessage } from "./slack/draft-message";
import { sendSlackMessage } from "./slack/send-message";

export function getTools(confirm: Confirm) {
  const confirmDraft = createDraftConfirmation(confirm);

  return {
    draftEmail,
    draftSlackMessage,
    sendEmail: sendEmail(confirmDraft),
    sendSlackMessage: sendSlackMessage(confirmDraft),
  };
}