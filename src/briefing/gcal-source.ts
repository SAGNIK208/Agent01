import type { CalendarReader } from "../connectors/communication/contracts";
import type {
  BriefingSource,
  BriefingWindow,
  SourceBatch,
  SourceItem,
} from "./types";
import { Temporal } from "@js-temporal/polyfill";

const CALENDAR_MAX_ITEMS = 20;

function formatEventTime(
  event: {
    start: { kind: string; value: string };
    end: { kind: string; value: string };
  },
): string {
  if (event.start.kind === "date" && event.end.kind === "date") {
    return `All day: ${event.start.value}`;
  }

  return `${event.start.value} to ${event.end.value}`;
}

function overlaps(
  a: { start: string; end: string },
  b: { start: string; end: string },
): boolean {
  return (
    Date.parse(a.start) < Date.parse(b.end) &&
    Date.parse(b.start) < Date.parse(a.end)
  );
}

export function createCalendarBriefingSource(input: {
  reader: CalendarReader;
  connectionId: string;
  tenantId: string;
}): BriefingSource {
  const { reader, connectionId, tenantId } = input;

  return {
    id: "google-calendar",
    label: "Google Calendar",
    kind: "calendar",

    async collect(window: BriefingWindow): Promise<SourceBatch> {
      const day = Temporal.PlainDate.from(
        Temporal.Instant.from(window.now).toZonedDateTimeISO(window.timeZone),
      );

      const endOfDay = day
        .add({ days: 1 })
        .toZonedDateTime(window.timeZone)
        .toInstant()
        .toString();

      const page = await reader.listEventsInRange({
        from: window.from,
        to: endOfDay,
        timeZone: window.timeZone,
        limit: CALENDAR_MAX_ITEMS,
      });

      const timedEvents = page.items.filter(
        (event) => event.start.kind === "dateTime",
      );

      const items: SourceItem[] = [];

      for (const event of page.items) {
        const startMs = Date.parse(event.start.value);
        const endMs = Date.parse(event.end.value);

        if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
          continue;
        }

        const conflicts = timedEvents.filter(
          (other) =>
            other.id !== event.id &&
            overlaps(
              { start: event.start.value, end: event.end.value },
              { start: other.start.value, end: other.end.value },
            ),
        );

        const excerptParts = [
          formatEventTime(event),
          event.attendeeStatus === "needsAction"
            ? "RSVP pending (response required)"
            : null,
          event.status === "tentative" ? "Tentative" : null,
          conflicts.length > 0
            ? `Potential overlap with: ${conflicts
                .map((conflict) => conflict.title)
                .join(", ")}`
            : null,
        ].filter(Boolean);

        items.push({
          title: event.title,
          excerpt: excerptParts.join(". "),
          occurredAt: event.start.value,
          target: {
            provider: "google-calendar",
            connectionId,
            itemId: event.id,
          },
        });
      }

      return {
        items,
        skipped: page.skipped,
        truncated: Boolean(page.nextCursor),
      };
    },
  };
}