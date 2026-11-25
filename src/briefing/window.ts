import { Temporal } from "@js-temporal/polyfill";
import type { BriefingWindow } from "./types";

export function todayWindow(
  timeZone: string,
  now = new Date(),
): BriefingWindow {
  const localNow = Temporal.Instant.fromEpochMilliseconds(now.getTime())
    .toZonedDateTimeISO(timeZone);

  return {
    timeZone,
    from: localNow.startOfDay().toInstant().toString(),
    now: localNow.toInstant().toString(),
  };
}