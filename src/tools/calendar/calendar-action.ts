import { Temporal } from "@js-temporal/polyfill";
import { tool } from "ai";
import { z } from "zod";

import type { Confirm } from "../../agent/confirm";
import type {
  CalendarEvent,
  CalendarEventDetails,
  CalendarReader,
} from "../../connectors/communication/contracts";
import { requireTimeZone } from "../../system/timezone";

const CALENDAR_PAGE_SIZE = 50;

export function formatToLocal24Hour(
  value: string | { kind: string; value: string },
  timeZone: string,
): string {
  const raw = typeof value === "string" ? value.trim() : value.value.trim();

  // If date-only (kind === "date" or YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const pad = (n: number) => String(n).padStart(2, "0");

  try {
    const instant = Temporal.Instant.from(raw);
    const zdt = instant.toZonedDateTimeISO(timeZone);
    return `${zdt.year}-${pad(zdt.month)}-${pad(zdt.day)} ${pad(zdt.hour)}:${pad(zdt.minute)}:${pad(zdt.second)}`;
  } catch {
    try {
      const instantStr = parseToInstantString(raw, timeZone);
      const instant = Temporal.Instant.from(instantStr);
      const zdt = instant.toZonedDateTimeISO(timeZone);
      return `${zdt.year}-${pad(zdt.month)}-${pad(zdt.day)} ${pad(zdt.hour)}:${pad(zdt.minute)}:${pad(zdt.second)}`;
    } catch {
      return raw;
    }
  }
}

function formatEvent(event: CalendarEvent, timeZone: string): string {
  const pendingTag =
    event.attendeeStatus === "needsAction" ? " [PENDING RESPONSE]" : "";
  const locationTag = event.location ? `\n  Location: ${event.location}` : "";
  const startStr = formatToLocal24Hour(event.start, timeZone);
  const endStr = formatToLocal24Hour(event.end, timeZone);
  return `- [${event.id}] ${event.title}${pendingTag}\n  Starts: ${startStr}\n  Ends: ${endStr}${locationTag}`;
}

function formatDetails(event: CalendarEventDetails, timeZone: string): string {
  const pendingTag =
    event.attendeeStatus === "needsAction" ? " [PENDING RESPONSE]" : "";
  const startStr = formatToLocal24Hour(event.start, timeZone);
  const endStr = formatToLocal24Hour(event.end, timeZone);
  return [
    `Title: ${event.title}${pendingTag}`,
    `ID: ${event.id}`,
    `Starts: ${startStr}`,
    `Ends: ${endStr}`,
    event.location ? `Location: ${event.location}` : null,
    event.meetingLink ? `Meeting link: ${event.meetingLink}` : null,
    event.attendees?.length
      ? `Attendees: ${event.attendees.join(", ")}`
      : null,
    event.description ? `Notes: ${event.description}` : null,
    `Status: ${event.status}`,
    event.attendeeStatus
      ? `Your RSVP Status: ${event.attendeeStatus}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function parseToInstantString(value: string, timeZone: string): string {
  const trimmed = value.trim();

  // Try parsing direct ISO Instant (e.g. 2026-11-24T10:00:00Z or with offset)
  try {
    return Temporal.Instant.from(trimmed).toString();
  } catch {
    // Try PlainDateTime with given timezone (e.g. 2026-11-24T10:00:00)
    try {
      return Temporal.PlainDateTime.from(trimmed)
        .toZonedDateTime(timeZone)
        .toInstant()
        .toString();
    } catch {
      // Try space-separated date-time (e.g. 2026-11-24 10:00:00 or 2026-11-24 10:00)
      if (trimmed.includes(" ")) {
        try {
          const parts = trimmed.split(" ");
          const timePart = parts[1]!.split(":").length === 2 ? `${parts[1]}:00` : parts[1];
          return Temporal.PlainDateTime.from(`${parts[0]}T${timePart}`)
            .toZonedDateTime(timeZone)
            .toInstant()
            .toString();
        } catch {
          // fall through
        }
      }

      // Try PlainDate (full day)
      const date = Temporal.PlainDate.from(trimmed);
      return date.toZonedDateTime(timeZone).toInstant().toString();
    }
  }
}

function computeRangeFromTimeframe(
  timeframe:
    | "today"
    | "tomorrow"
    | "this_week"
    | "next_week"
    | "this_month"
    | "next_month",
  timeZone: string,
): { startDate: Temporal.PlainDate; endDate: Temporal.PlainDate } {
  const today = Temporal.Now.plainDateISO(timeZone);

  switch (timeframe) {
    case "today":
      return { startDate: today, endDate: today };

    case "tomorrow": {
      const tomorrow = today.add({ days: 1 });
      return { startDate: tomorrow, endDate: tomorrow };
    }

    case "this_week": {
      // ISO 8601: Monday is 1, Sunday is 7
      const dayOfWeek = today.dayOfWeek;
      const startOfWeek = today.subtract({ days: dayOfWeek - 1 });
      const endOfWeek = startOfWeek.add({ days: 6 });
      return { startDate: startOfWeek, endDate: endOfWeek };
    }

    case "next_week": {
      const dayOfWeek = today.dayOfWeek;
      const startOfNextWeek = today
        .subtract({ days: dayOfWeek - 1 })
        .add({ days: 7 });
      const endOfNextWeek = startOfNextWeek.add({ days: 6 });
      return { startDate: startOfNextWeek, endDate: endOfNextWeek };
    }

    case "this_month": {
      const startOfMonth = today.with({ day: 1 });
      const endOfMonth = today.with({ day: today.daysInMonth });
      return { startDate: startOfMonth, endDate: endOfMonth };
    }

    case "next_month": {
      const startOfNextMonth = today.with({ day: 1 }).add({ months: 1 });
      const endOfNextMonth = startOfNextMonth.with({
        day: startOfNextMonth.daysInMonth,
      });
      return { startDate: startOfNextMonth, endDate: endOfNextMonth };
    }
  }
}

export function createCalendarActionTools(
  reader: CalendarReader,
  confirm: Confirm,
) {
  const listCalendarEvents = tool({
    description:
      "List events from the user's primary Google Calendar for exactly one local calendar day (e.g. today, tomorrow, or a specific YYYY-MM-DD date). " +
      "Can filter for pending invitations waiting for response.",
    inputSchema: z.object({
      date: z
        .string()
        .trim()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("Specific date in YYYY-MM-DD format. Defaults to today."),
      timeframe: z
        .enum(["today", "tomorrow"])
        .optional()
        .describe("Convenient day selector: 'today' or 'tomorrow'."),
      filter: z
        .enum(["all", "pending"])
        .default("all")
        .describe("Filter events: 'all' or 'pending' to only see invitations needing your response."),
      cursor: z.string().trim().min(1).optional(),
    }),
    execute: async ({ date, timeframe, filter, cursor }) => {
      let timeZone: string;
      try {
        timeZone = requireTimeZone();
      } catch {
        return { status: "timezone_unavailable" as const };
      }

      let day: Temporal.PlainDate;
      try {
        if (timeframe === "tomorrow") {
          day = Temporal.Now.plainDateISO(timeZone).add({ days: 1 });
        } else if (date) {
          day = Temporal.PlainDate.from(date);
        } else {
          day = Temporal.Now.plainDateISO(timeZone);
        }
      } catch {
        return { status: "invalid_date" as const };
      }

      const from = day.toZonedDateTime(timeZone).toInstant().toString();
      const to = day
        .add({ days: 1 })
        .toZonedDateTime(timeZone)
        .toInstant()
        .toString();

      try {
        const page = await reader.listEvents({
          from,
          to,
          timeZone,
          filter,
          limit: CALENDAR_PAGE_SIZE,
          ...(cursor ? { cursor } : {}),
        });

        return {
          status: "ok" as const,
          date: day.toString(),
          timeZone,
          filter,
          items: page.items,
          skipped: page.skipped,
          nextCursor: page.nextCursor,
          formatted:
            page.items.map((e) => formatEvent(e, timeZone)).join("\n") ||
            (filter === "pending"
              ? "No pending invitations for this date."
              : "No events scheduled for this date."),
        };
      } catch (error) {
        console.error("[calendar-tool] listCalendarEvents failed:", error);
        return {
          status: "unavailable" as const,
          date: day.toString(),
        };
      }
    },
  });

  const listCalendarEventsInRange = tool({
    description:
      "List events from the user's primary Google Calendar for a date range (e.g. this_week, next_week, this_month, next_month, or custom from/to dates). " +
      "Can filter for pending invitations waiting for response.",
    inputSchema: z.object({
      timeframe: z
        .enum([
          "today",
          "tomorrow",
          "this_week",
          "next_week",
          "this_month",
          "next_month",
        ])
        .optional()
        .describe(
          "Named timeframe like 'this_week', 'next_week', 'this_month', or 'next_month'.",
        ),
      from: z
        .string()
        .trim()
        .optional()
        .describe("Start date in YYYY-MM-DD format (inclusive)."),
      to: z
        .string()
        .trim()
        .optional()
        .describe("End date in YYYY-MM-DD format (inclusive)."),
      filter: z
        .enum(["all", "pending"])
        .default("all")
        .describe("Filter events: 'all' or 'pending' to only see invitations waiting for your response."),
      timeZone: z.string().trim().min(1).optional(),
      cursor: z.string().trim().min(1).optional(),
    }),
    execute: async ({
      timeframe,
      from: requestedFrom,
      to: requestedTo,
      filter,
      timeZone: requestedTimeZone,
      cursor,
    }) => {
      let timeZone: string;
      try {
        timeZone = requestedTimeZone ?? requireTimeZone();
      } catch {
        return { status: "timezone_unavailable" as const };
      }

      let startDate: Temporal.PlainDate;
      let endDate: Temporal.PlainDate;

      try {
        if (timeframe) {
          const computed = computeRangeFromTimeframe(timeframe, timeZone);
          startDate = computed.startDate;
          endDate = computed.endDate;
        } else if (requestedFrom) {
          startDate = Temporal.PlainDate.from(requestedFrom);
          endDate = requestedTo
            ? Temporal.PlainDate.from(requestedTo)
            : startDate;
        } else {
          // Default to this week
          const computed = computeRangeFromTimeframe("this_week", timeZone);
          startDate = computed.startDate;
          endDate = computed.endDate;
        }
      } catch {
        return { status: "invalid_date" as const };
      }

      if (Temporal.PlainDate.compare(endDate, startDate) < 0) {
        return { status: "invalid_range" as const };
      }

      const fromInstant = startDate
        .toZonedDateTime(timeZone)
        .toInstant()
        .toString();

      const toInstant = endDate
        .add({ days: 1 })
        .toZonedDateTime(timeZone)
        .toInstant()
        .toString();

      try {
        const page = await reader.listEventsInRange({
          from: fromInstant,
          to: toInstant,
          timeZone,
          filter,
          limit: CALENDAR_PAGE_SIZE,
          ...(cursor ? { cursor } : {}),
        });

        return {
          status: "ok" as const,
          from: startDate.toString(),
          to: endDate.toString(),
          timeZone,
          filter,
          items: page.items,
          skipped: page.skipped,
          nextCursor: page.nextCursor,
          formatted:
            page.items.map((e) => formatEvent(e, timeZone)).join("\n") ||
            (filter === "pending"
              ? "No pending invitations found in this range."
              : "No events scheduled in this range."),
        };
      } catch (error) {
        console.error(
          "[calendar-tool] listCalendarEventsInRange failed:",
          error,
        );

        return {
          status: "unavailable" as const,
          from: startDate.toString(),
          to: endDate.toString(),
        };
      }
    },
  });

  const listPendingCalendarInvitations = tool({
    description:
      "Check which calendar invitations are pending your response (attendee status 'needsAction'). " +
      "Searches across this month by default, or for this_week / next_week.",
    inputSchema: z.object({
      timeframe: z
        .enum(["this_week", "next_week", "this_month", "next_month"])
        .default("this_month")
        .describe("Timeframe to check for pending invitations."),
    }),
    execute: async ({ timeframe }) => {
      let timeZone: string;
      try {
        timeZone = requireTimeZone();
      } catch {
        return { status: "timezone_unavailable" as const };
      }

      const { startDate, endDate } = computeRangeFromTimeframe(
        timeframe,
        timeZone,
      );

      const fromInstant = startDate
        .toZonedDateTime(timeZone)
        .toInstant()
        .toString();

      const toInstant = endDate
        .add({ days: 1 })
        .toZonedDateTime(timeZone)
        .toInstant()
        .toString();

      try {
        const page = await reader.listEventsInRange({
          from: fromInstant,
          to: toInstant,
          timeZone,
          filter: "pending",
          limit: CALENDAR_PAGE_SIZE,
        });

        return {
          status: "ok" as const,
          timeframe,
          from: startDate.toString(),
          to: endDate.toString(),
          pendingCount: page.items.length,
          items: page.items,
          formatted:
            page.items.length > 0
              ? `Pending Invitations (${page.items.length}):\n` +
                page.items.map((e) => formatEvent(e, timeZone)).join("\n")
              : "You have no pending calendar invitations.",
        };
      } catch (error) {
        console.error(
          "[calendar-tool] listPendingCalendarInvitations failed:",
          error,
        );
        return { status: "unavailable" as const };
      }
    },
  });

  const getCalendarEventDetails = tool({
    description:
      "Get complete details for one Google Calendar event by its ID (including description, location, meeting link, attendees, and RSVP status).",
    inputSchema: z.object({
      eventId: z.string().trim().min(1).describe("The event ID."),
    }),
    execute: async ({ eventId }) => {
      let timeZone = "UTC";
      try {
        timeZone = requireTimeZone();
      } catch {}

      try {
        const event = await reader.getEventDetails(eventId);

        return event
          ? {
              status: "ok" as const,
              event,
              formatted: formatDetails(event, timeZone),
            }
          : { status: "not_available" as const };
      } catch (error) {
        console.error("[calendar-tool] getEventDetails failed:", error);
        return { status: "unavailable" as const };
      }
    },
  });

  const checkCalendarAvailability = tool({
    description:
      "Check whether the user and optional attendees are busy or free during a proposed time range. " +
      "Advisory only; does not create or modify events.",
    inputSchema: z.object({
      from: z.string().trim().min(1).describe("Start time (date, datetime, or ISO string)."),
      to: z.string().trim().min(1).describe("End time (date, datetime, or ISO string)."),
      timeZone: z.string().trim().min(1).optional().describe("Timezone (defaults to user's local timezone)."),
      attendeeEmails: z.array(z.string().trim()).default([]).describe("Optional email addresses of attendees to check."),
    }),
    execute: async ({
      from: rawFrom,
      to: rawTo,
      timeZone: requestedTimeZone,
      attendeeEmails,
    }) => {
      let timeZone: string;
      try {
        timeZone = requestedTimeZone ?? requireTimeZone();
      } catch {
        return { status: "timezone_unavailable" as const };
      }

      let fromInstant: string;
      let toInstant: string;

      try {
        fromInstant = parseToInstantString(rawFrom, timeZone);
        toInstant = parseToInstantString(rawTo, timeZone);
      } catch {
        return { status: "invalid_time" as const };
      }

      if (
        Temporal.Instant.from(toInstant).epochMilliseconds <=
        Temporal.Instant.from(fromInstant).epochMilliseconds
      ) {
        return { status: "invalid_range" as const };
      }

      const attendeeList = attendeeEmails ?? [];
      const invalidEmail = attendeeList.find(
        (email) => !isValidEmail(email),
      );

      if (invalidEmail) {
        return {
          status: "invalid_attendee" as const,
          email: invalidEmail,
        };
      }

      try {
        const availability = await reader.checkAvailability({
          from: fromInstant,
          to: toInstant,
          timeZone,
          attendeeEmails: attendeeList,
        });

        return {
          status: "ok" as const,
          availability: availability.status,
          busyPeriods: availability.busyPeriods.map((period) => ({
            from: formatToLocal24Hour(period.from, timeZone),
            to: formatToLocal24Hour(period.to, timeZone),
          })),
          error: availability.error,
        };
      } catch (error) {
        console.error("[calendar-tool] checkAvailability failed:", error);
        return { status: "unavailable" as const };
      }
    },
  });

  const createCalendarEvent = tool({
    description:
      "Create a new event on the user's primary Google Calendar. " +
      "Requires explicit user confirmation before creation.",
    inputSchema: z.object({
      title: z.string().trim().min(1).describe("Event title / summary."),
      start: z.string().trim().min(1).describe("Start time (ISO 8601 string or YYYY-MM-DD HH:mm:ss)."),
      end: z.string().trim().min(1).describe("End time (ISO 8601 string or YYYY-MM-DD HH:mm:ss)."),
      timeZone: z.string().trim().min(1).optional().describe("Timezone (defaults to user's local timezone)."),
      videoConferencing: z
        .enum(["google_meet", "none"])
        .optional()
        .describe("Set to 'google_meet' to automatically create and attach an active Google Meet video call link (just like in the Google Calendar UI)."),
      meetingLink: z
        .string()
        .trim()
        .optional()
        .describe("Optional existing video call link (e.g. Microsoft Teams, Zoom, or custom meeting URL)."),
      description: z.string().trim().optional().describe("Description / notes for the event."),
      location: z.string().trim().optional().describe("Physical location or room (do not put 'Google Meet' here; use videoConferencing: 'google_meet')."),
      attendeeEmails: z.array(z.string().trim()).default([]).describe("Guest email addresses to invite."),
    }),
    execute: async (input) => {
      let timeZone: string;
      try {
        timeZone = input.timeZone ?? requireTimeZone();
      } catch {
        return { status: "timezone_unavailable" as const };
      }

      let startInstant: string;
      let endInstant: string;

      try {
        startInstant = parseToInstantString(input.start, timeZone);
        endInstant = parseToInstantString(input.end, timeZone);
      } catch {
        return { status: "invalid_time" as const };
      }

      if (
        Temporal.Instant.from(endInstant).epochMilliseconds <=
        Temporal.Instant.from(startInstant).epochMilliseconds
      ) {
        return { status: "invalid_range" as const };
      }

      const attendeeEmails = input.attendeeEmails ?? [];
      const invalidEmail = attendeeEmails.find(
        (email) => !isValidEmail(email),
      );

      if (invalidEmail) {
        return {
          status: "invalid_attendee" as const,
          email: invalidEmail,
        };
      }

      const preview = [
        `Calendar Action: Create event`,
        `Title: ${input.title}`,
        `Starts: ${formatToLocal24Hour(startInstant, timeZone)}`,
        `Ends: ${formatToLocal24Hour(endInstant, timeZone)}`,
        `Time zone: ${timeZone}`,
        input.videoConferencing === "google_meet"
          ? `Video Conference: Google Meet (will be auto-generated)`
          : input.meetingLink
            ? `Meeting Link: ${input.meetingLink}`
            : null,
        input.location ? `Location: ${input.location}` : null,
        attendeeEmails.length
          ? `Attendees: ${attendeeEmails.join(", ")}`
          : null,
        input.description ? `Notes: ${input.description}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      const approved = await confirm(preview);

      if (!approved) {
        return { status: "declined" as const, reason: "User declined to create the event." };
      }

      const result = await reader.createEvent({
        ...input,
        start: startInstant,
        end: endInstant,
        timeZone,
      });

      return result.status === "created"
        ? {
            status: "ok" as const,
            eventId: result.eventId,
            title: input.title,
            starts: formatToLocal24Hour(startInstant, timeZone),
            ends: formatToLocal24Hour(endInstant, timeZone),
            meetingLink: result.meetingLink,
          }
        : {
            status: "unavailable" as const,
            error: result.error,
          };
    },
  });

  const updateCalendarEvent = tool({
    description:
      "Update an existing Google Calendar event. " +
      "Requires explicit user confirmation before applying updates.",
    inputSchema: z.object({
      eventId: z.string().trim().min(1).describe("The event ID to update."),
      title: z.string().trim().optional().describe("New title / summary."),
      start: z.string().trim().optional().describe("New start time."),
      end: z.string().trim().optional().describe("New end time."),
      timeZone: z.string().trim().optional().describe("Timezone."),
      videoConferencing: z
        .enum(["google_meet", "none"])
        .optional()
        .describe("Set to 'google_meet' to add an active Google Meet video call link to the event."),
      meetingLink: z
        .string()
        .trim()
        .optional()
        .describe("Optional video call link (e.g. Microsoft Teams, Zoom, or custom URL)."),
      description: z.string().trim().optional().describe("New description."),
      location: z.string().trim().optional().describe("New location (physical room or address)."),
      attendeeEmails: z.array(z.string().trim()).optional().describe("New guest list."),
    }),
    execute: async (input) => {
      const existing = await reader.getEventDetails(input.eventId);

      if (!existing) {
        return { status: "not_available" as const };
      }

      let timeZone: string;
      try {
        timeZone = input.timeZone ?? requireTimeZone();
      } catch {
        return { status: "timezone_unavailable" as const };
      }

      let startInstant: string;
      let endInstant: string;

      const rawStart = input.start ?? existing.start.value;
      const rawEnd = input.end ?? existing.end.value;

      try {
        startInstant = parseToInstantString(rawStart, timeZone);
        endInstant = parseToInstantString(rawEnd, timeZone);
      } catch {
        return { status: "invalid_time" as const };
      }

      if (
        Temporal.Instant.from(endInstant).epochMilliseconds <=
        Temporal.Instant.from(startInstant).epochMilliseconds
      ) {
        return { status: "invalid_range" as const };
      }

      const preview = [
        `Calendar Action: Update event`,
        `Event: ${existing.title} (${existing.id})`,
        "",
        "Proposed changes:",
        input.title ? `Title: ${input.title}` : null,
        input.start ? `Starts: ${formatToLocal24Hour(startInstant, timeZone)}` : null,
        input.end ? `Ends: ${formatToLocal24Hour(endInstant, timeZone)}` : null,
        input.videoConferencing === "google_meet"
          ? `Video Conference: Add Google Meet link`
          : input.meetingLink
            ? `Meeting Link: ${input.meetingLink}`
            : null,
        input.location ? `Location: ${input.location}` : null,
        input.description ? `Notes: ${input.description}` : null,
        input.attendeeEmails
          ? `Attendees: ${input.attendeeEmails.join(", ")}`
          : null,
      ]
        .filter(Boolean)
        .join("\n");

      const approved = await confirm(preview);

      if (!approved) {
        return { status: "declined" as const, reason: "User declined the update." };
      }

      const result = await reader.updateEvent({
        ...input,
        start: startInstant,
        end: endInstant,
        timeZone,
      });

      return result.status === "updated"
        ? {
            status: "ok" as const,
            eventId: result.eventId,
            meetingLink: result.meetingLink,
          }
        : {
            status: "unavailable" as const,
            error: result.error,
          };
    },
  });

  const deleteCalendarEvent = tool({
    description:
      "Delete an existing Google Calendar event. " +
      "Requires explicit user confirmation before deletion.",
    inputSchema: z.object({
      eventId: z.string().trim().min(1).describe("The event ID to delete."),
    }),
    execute: async ({ eventId }) => {
      const existing = await reader.getEventDetails(eventId);

      if (!existing) {
        return { status: "not_available" as const };
      }

      let timeZone = "UTC";
      try {
        timeZone = requireTimeZone();
      } catch {}

      const preview = [
        `Calendar Action: Delete event`,
        `Title: ${existing.title}`,
        `Starts: ${formatToLocal24Hour(existing.start, timeZone)}`,
        `Ends: ${formatToLocal24Hour(existing.end, timeZone)}`,
        existing.location ? `Location: ${existing.location}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      const approved = await confirm(preview);

      if (!approved) {
        return { status: "declined" as const, reason: "User declined to delete the event." };
      }

      const result = await reader.deleteEvent(eventId);

      return result.status === "deleted"
        ? { status: "ok" as const }
        : {
            status: "unavailable" as const,
            error: result.error,
          };
    },
  });

  const respondToCalendarEvent = tool({
    description:
      "Respond to a calendar invitation (accepted, declined, or tentative). " +
      "Requires explicit user confirmation before sending the response.",
    inputSchema: z.object({
      eventId: z.string().trim().min(1).describe("The event ID to respond to."),
      response: z
        .enum(["accepted", "declined", "tentative"])
        .describe("Your RSVP response."),
      comment: z.string().trim().optional().describe("Optional message or comment with your response."),
    }),
    execute: async (input) => {
      const existing = await reader.getEventDetails(input.eventId);

      if (!existing) {
        return { status: "not_available" as const };
      }

      let timeZone = "UTC";
      try {
        timeZone = requireTimeZone();
      } catch {}

      const preview = [
        `Calendar Action: Respond to invitation`,
        `Event: ${existing.title}`,
        `Starts: ${formatToLocal24Hour(existing.start, timeZone)}`,
        `Your Response: ${input.response.toUpperCase()}`,
        input.comment ? `Comment: ${input.comment}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      const approved = await confirm(preview);

      if (!approved) {
        return { status: "declined" as const, reason: "User declined to submit response." };
      }

      const result = await reader.respondToEvent({
        eventId: input.eventId,
        response: input.response,
        comment: input.comment,
      });

      return result.status === "updated"
        ? { status: "ok" as const, eventId: input.eventId, response: input.response }
        : {
            status: "unavailable" as const,
            error: result.error,
          };
    },
  });

  const setCalendarOutOfOffice = tool({
    description:
      "Create an out-of-office block on the user's primary Google Calendar. " +
      "Requires explicit user confirmation before creating.",
    inputSchema: z.object({
      title: z.string().trim().min(1).describe("Out of office title (e.g. 'Out of Office - Vacation')."),
      from: z.string().trim().min(1).describe("Start time (date, datetime, or ISO string)."),
      to: z.string().trim().min(1).describe("End time (date, datetime, or ISO string)."),
      timeZone: z.string().trim().optional().describe("Timezone (defaults to user's local timezone)."),
      message: z.string().trim().optional().describe("Decline message or notes."),
    }),
    execute: async (input) => {
      let timeZone: string;
      try {
        timeZone = input.timeZone ?? requireTimeZone();
      } catch {
        return { status: "timezone_unavailable" as const };
      }

      let fromInstant: string;
      let toInstant: string;

      try {
        fromInstant = parseToInstantString(input.from, timeZone);
        toInstant = parseToInstantString(input.to, timeZone);
      } catch {
        return { status: "invalid_time" as const };
      }

      if (
        Temporal.Instant.from(toInstant).epochMilliseconds <=
        Temporal.Instant.from(fromInstant).epochMilliseconds
      ) {
        return { status: "invalid_range" as const };
      }

      const preview = [
        `Calendar Action: Set Out of Office`,
        `Title: ${input.title}`,
        `From: ${formatToLocal24Hour(fromInstant, timeZone)}`,
        `To: ${formatToLocal24Hour(toInstant, timeZone)}`,
        `Time zone: ${timeZone}`,
        input.message ? `Message: ${input.message}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      const approved = await confirm(preview);

      if (!approved) {
        return { status: "declined" as const, reason: "User declined to set out of office." };
      }

      const result = await reader.setOutOfOffice({
        ...input,
        from: fromInstant,
        to: toInstant,
        timeZone,
      });

      return result.status === "created"
        ? { status: "ok" as const, eventId: result.eventId }
        : {
            status: "unavailable" as const,
            error: result.error,
          };
    },
  });

  return {
    listCalendarEvents,
    listCalendarEventsInRange,
    listPendingCalendarInvitations,
    getCalendarEventDetails,
    checkCalendarAvailability,
    createCalendarEvent,
    updateCalendarEvent,
    deleteCalendarEvent,
    respondToCalendarEvent,
    setCalendarOutOfOffice,
  };
}
