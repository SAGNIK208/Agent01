import type { LanguageModel } from "ai";
import {
  createDailyBriefing,
  createGmailBriefingSource,
  createSlackBriefingSource,
  createCalendarBriefingSource,
  createSqliteCheckpointStore,
} from "../briefing";
import { corsair, db } from "../connectors/corsair";
import type { CalendarReader } from "../connectors/communication/contracts";

export function createConfiguredDailyBriefing(
  model: LanguageModel,
  calendarReader: CalendarReader,
) {
  const checkpoints = createSqliteCheckpointStore(db);

  const { source: slackBriefingSource } = createSlackBriefingSource({
    api: corsair.slack.api.channels,
    connectionId: "default",
    tenantId: "default",
    checkpoints,
  });

  return createDailyBriefing({
    model,
    checkpoints,
    tenantId: "default",
    sources: [
      createGmailBriefingSource({
        api: corsair.gmail.api.messages,
        connectionId: "default",
        tenantId: "default",
        checkpoints,
      }),
      slackBriefingSource,
      createCalendarBriefingSource({
        reader: calendarReader,
        connectionId: "default",
        tenantId: "default",
      }),
    ],
  });
}