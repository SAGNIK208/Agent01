import { randomUUID } from "node:crypto";
import type { corsair } from "../corsair";
import type {
  CalendarAvailability,
  CalendarAvailabilityInput,
  CalendarCreateEventInput,
  CalendarEvent,
  CalendarEventDetails,
  CalendarEventMutationResult,
  CalendarEventPage,
  CalendarEventResponseInput,
  CalendarEventTime,
  CalendarListEventsInput,
  CalendarOutOfOfficeInput,
  CalendarRangeInput,
  CalendarRangePage,
  CalendarReader,
  CalendarUpdateEventInput,
  PageRequest,
} from "./contracts";

const PRIMARY_CALENDAR_ID = "primary";

type GoogleCalendarEventsApi = typeof corsair.googlecalendar.api.events;
type GoogleCalendarCalendarApi = typeof corsair.googlecalendar.api.calendar;

interface GoogleEventTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

interface GoogleAttendee {
  id?: string;
  email?: string;
  displayName?: string;
  organizer?: boolean;
  self?: boolean;
  resource?: boolean;
  optional?: boolean;
  responseStatus?: "needsAction" | "declined" | "tentative" | "accepted";
  comment?: string;
  additionalGuests?: number;
}

interface GoogleEvent {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  status?: string;
  hangoutLink?: string;
  conferenceData?: {
    entryPoints?: {
      uri?: string;
    }[];
  };
  start?: GoogleEventTime;
  end?: GoogleEventTime;
  attendees?: GoogleAttendee[];
  organizer?: {
    id?: string;
    email?: string;
    displayName?: string;
    self?: boolean;
  };
  recurrence?: string[];
}

interface GoogleEventsPage {
  items?: GoogleEvent[];
  nextPageToken?: string;
}

function toEventTime(time: GoogleEventTime | undefined): CalendarEventTime | null {
  if (!time) return null;

  if (time.dateTime) {
    return { kind: "dateTime", value: time.dateTime };
  }

  if (time.date) {
    return { kind: "date", value: time.date };
  }

  return null;
}

function fromEventTime(time: CalendarEventTime): GoogleEventTime {
  return time.kind === "date"
    ? { date: time.value }
    : { dateTime: time.value };
}

function normalizeEvent(event: GoogleEvent): CalendarEvent | null {
  const id = event.id;
  const start = toEventTime(event.start);
  const end = toEventTime(event.end);

  if (!id || !start || !end || event.status === "cancelled") {
    return null;
  }

  const myAttendee = event.attendees?.find((a) => a.self === true);
  const attendeeStatus = myAttendee?.responseStatus;

  return {
    id,
    title: event.summary?.trim() || "(untitled event)",
    start,
    end,
    location: event.location?.trim() || undefined,
    status:
      event.status === "tentative"
        ? "tentative"
        : event.status === "cancelled"
          ? "cancelled"
          : "confirmed",
    ...(attendeeStatus ? { attendeeStatus } : {}),
    ...(event.organizer?.self !== undefined
      ? { isOrganizer: event.organizer.self }
      : {}),
  };
}

function normalizeEventDetails(
  event: GoogleEvent,
): CalendarEventDetails | null {
  const base = normalizeEvent(event);

  if (!base) return null;

  const meetingLink =
    event.hangoutLink ??
    event.conferenceData?.entryPoints?.find((entry) => entry.uri)?.uri;

  return {
    ...base,
    description: event.description,
    location: event.location,
    meetingLink,
    attendees: event.attendees
      ?.map((attendee) => attendee.email)
      .filter((email): email is string => Boolean(email)),
    status:
      event.status === "cancelled"
        ? "cancelled"
        : event.status === "tentative"
          ? "tentative"
          : "confirmed",
  };
}

function normalizePage(
  response: GoogleEventsPage,
  filter?: "all" | "pending",
): CalendarEventPage {
  const items: CalendarEvent[] = [];
  let skipped = 0;

  for (const event of response.items ?? []) {
    const normalized = normalizeEvent(event);

    if (normalized) {
      if (filter === "pending" && normalized.attendeeStatus !== "needsAction") {
        skipped += 1;
        continue;
      }
      items.push(normalized);
    } else {
      skipped += 1;
    }
  }

  return {
    items,
    skipped,
    ...(response.nextPageToken ? { nextCursor: response.nextPageToken } : {}),
  };
}

function eventMutationError(error: unknown): CalendarEventMutationResult {
  return {
    status: "failed",
    error: error instanceof Error ? error.message : "Calendar request failed",
  };
}

export function createGoogleCalendarReader(api: {
  events: GoogleCalendarEventsApi;
  calendar: GoogleCalendarCalendarApi;
}): CalendarReader {
  const { events, calendar } = api;

  return {
    async listEvents(
      input: CalendarListEventsInput,
    ): Promise<CalendarEventPage> {
      const response = await events.getMany({
        calendarId: PRIMARY_CALENDAR_ID,
        timeMin: input.from,
        timeMax: input.to,
        timeZone: input.timeZone,
        singleEvents: true,
        orderBy: "startTime",
        maxResults: input.limit,
        ...(input.cursor ? { pageToken: input.cursor } : {}),
      });

      return normalizePage(response as GoogleEventsPage, input.filter);
    },

    async listEventsInRange(
      input: CalendarRangeInput & PageRequest,
    ): Promise<CalendarRangePage> {
      const response = await events.getMany({
        calendarId: PRIMARY_CALENDAR_ID,
        timeMin: input.from,
        timeMax: input.to,
        timeZone: input.timeZone,
        singleEvents: true,
        orderBy: "startTime",
        maxResults: input.limit,
        ...(input.cursor ? { pageToken: input.cursor } : {}),
      });

      return normalizePage(response as GoogleEventsPage, input.filter);
    },

    async getEvent(eventId: string): Promise<CalendarEvent | null> {
      try {
        const response = await events.get({
          calendarId: PRIMARY_CALENDAR_ID,
          id: eventId,
        });

        return normalizeEvent(response as GoogleEvent);
      } catch {
        return null;
      }
    },

    async getEventDetails(
      eventId: string,
    ): Promise<CalendarEventDetails | null> {
      try {
        const response = await events.get({
          calendarId: PRIMARY_CALENDAR_ID,
          id: eventId,
        });

        return normalizeEventDetails(response as GoogleEvent);
      } catch {
        return null;
      }
    },

    async checkAvailability(
      input: CalendarAvailabilityInput,
    ): Promise<CalendarAvailability> {
      try {
        const response = await calendar.getAvailability({
          timeMin: input.from,
          timeMax: input.to,
          timeZone: input.timeZone,
          items: input.attendeeEmails.map((email) => ({ id: email })),
        });

        const busyPeriods = Object.values(response.calendars ?? {}).flatMap(
          (cal) =>
            (cal.busy ?? [])
              .filter((period) => period.start && period.end)
              .map((period) => ({
                from: period.start as string,
                to: period.end as string,
              })),
        );

        return {
          status: busyPeriods.length > 0 ? "unavailable" : "available",
          busyPeriods,
        };
      } catch (error) {
        return {
          status: "unknown",
          busyPeriods: [],
          error:
            error instanceof Error
              ? error.message
              : "Could not check availability",
        };
      }
    },

    async createEvent(
      input: CalendarCreateEventInput,
    ): Promise<CalendarEventMutationResult> {
      try {
        const hasGoogleMeet = input.videoConferencing === "google_meet";
        const conferenceData = hasGoogleMeet
          ? {
              createRequest: {
                requestId: randomUUID(),
                conferenceSolutionKey: {
                  type: "hangoutsMeet",
                },
              },
            }
          : undefined;

        let description = input.description;
        if (input.meetingLink && !hasGoogleMeet) {
          const linkNote = `Meeting Link: ${input.meetingLink}`;
          description = description ? `${description}\n\n${linkNote}` : linkNote;
        }

        const start = fromEventTime({
          kind: "dateTime",
          value: input.start,
        });
        const end = fromEventTime({
          kind: "dateTime",
          value: input.end,
        });

        const response = await events.create({
          calendarId: PRIMARY_CALENDAR_ID,
          ...(hasGoogleMeet ? { conferenceDataVersion: 1 } : {}),
          event: {
            summary: input.title,
            description,
            location:
              input.location ??
              (input.meetingLink && !hasGoogleMeet ? input.meetingLink : undefined),
            start,
            end,
            attendees: input.attendeeEmails?.map((email) => ({ email })),
            ...(conferenceData ? { conferenceData } : {}),
          },
        });

        if (!response.id) {
          return {
            status: "failed",
            error: "Google Calendar did not return an event ID",
          };
        }

        let meetingLink =
          response.hangoutLink ??
          response.conferenceData?.entryPoints?.find((entry) => entry.uri)?.uri ??
          input.meetingLink;

        // Corsair's events.create does not forward query params (conferenceDataVersion: 1)
        // to Google's API, but events.update does.
        // If Google Meet was requested but no hangoutLink was generated on create,
        // attach conferenceData via events.update with conferenceDataVersion: 1.
        if (hasGoogleMeet && !meetingLink) {
          try {
            const updated = (await events.update({
              calendarId: PRIMARY_CALENDAR_ID,
              id: response.id,
              conferenceDataVersion: 1,
              event: {
                summary: input.title,
                description,
                location: input.location,
                start,
                end,
                attendees: input.attendeeEmails?.map((email) => ({ email })),
                conferenceData,
              } as any,
            })) as GoogleEvent;

            meetingLink =
              updated.hangoutLink ??
              updated.conferenceData?.entryPoints?.find((entry) => entry.uri)?.uri;
          } catch (updateErr) {
            console.warn("[gcal] attach Google Meet conference on create error:", updateErr);
          }
        }

        return {
          status: "created",
          eventId: response.id,
          meetingLink,
        };
      } catch (error) {
        return eventMutationError(error);
      }
    },

    async updateEvent(
      input: CalendarUpdateEventInput,
    ): Promise<CalendarEventMutationResult> {
      try {
        const existing = (await events.get({
          calendarId: PRIMARY_CALENDAR_ID,
          id: input.eventId,
        })) as GoogleEvent;

        if (!existing || !existing.id) {
          return {
            status: "failed",
            error: `Event ${input.eventId} not found`,
          };
        }

        const hasGoogleMeet = input.videoConferencing === "google_meet";
        const removeConference = input.videoConferencing === "none";

        const conferenceData = hasGoogleMeet
          ? {
              createRequest: {
                requestId: randomUUID(),
                conferenceSolutionKey: {
                  type: "hangoutsMeet",
                },
              },
            }
          : undefined;

        let description = input.description !== undefined ? input.description : existing.description;
        if (input.meetingLink && !hasGoogleMeet) {
          const linkNote = `Meeting Link: ${input.meetingLink}`;
          description = description ? `${description}\n\n${linkNote}` : linkNote;
        }

        const summary = input.title !== undefined ? input.title : existing.summary;
        const location =
          input.location !== undefined
            ? input.location
            : (input.meetingLink && !hasGoogleMeet ? input.meetingLink : existing.location);

        const start = input.start !== undefined
          ? fromEventTime({ kind: "dateTime", value: input.start })
          : existing.start;

        const end = input.end !== undefined
          ? fromEventTime({ kind: "dateTime", value: input.end })
          : existing.end;

        const attendees = input.attendeeEmails !== undefined
          ? input.attendeeEmails.map((email) => ({ email }))
          : existing.attendees;

        const eventPayload: Record<string, unknown> = {
          summary,
          description,
          location,
          start,
          end,
          attendees,
          recurrence: existing.recurrence,
        };

        if (conferenceData) {
          eventPayload.conferenceData = conferenceData;
        } else if (!removeConference && existing.conferenceData) {
          eventPayload.conferenceData = existing.conferenceData;
        }

        const response = (await events.update({
          calendarId: PRIMARY_CALENDAR_ID,
          id: input.eventId,
          ...(hasGoogleMeet || existing.conferenceData ? { conferenceDataVersion: 1 } : {}),
          event: eventPayload as any,
        })) as GoogleEvent;

        const meetingLink =
          response.hangoutLink ??
          response.conferenceData?.entryPoints?.find((entry) => entry.uri)?.uri ??
          input.meetingLink ??
          existing.hangoutLink ??
          existing.conferenceData?.entryPoints?.find((entry) => entry.uri)?.uri;

        return {
          status: "updated",
          eventId: response.id ?? input.eventId,
          meetingLink,
        };
      } catch (error) {
        return eventMutationError(error);
      }
    },

    async deleteEvent(
      eventId: string,
    ): Promise<CalendarEventMutationResult> {
      try {
        await events.delete({
          calendarId: PRIMARY_CALENDAR_ID,
          id: eventId,
        });

        return {
          status: "deleted",
          eventId,
        };
      } catch (error) {
        return eventMutationError(error);
      }
    },

    async respondToEvent(
      input: CalendarEventResponseInput,
    ): Promise<CalendarEventMutationResult> {
      try {
        const existing = await events.get({
          calendarId: PRIMARY_CALENDAR_ID,
          id: input.eventId,
        });

        let foundSelf = false;
        const attendees: GoogleAttendee[] = (existing.attendees ?? []).map((attendee) => {
          if (attendee.self) {
            foundSelf = true;
            return {
              ...attendee,
              responseStatus: input.response,
              ...(input.comment ? { comment: input.comment } : {}),
            };
          }
          return attendee;
        });

        if (!foundSelf) {
          const userEmail = process.env.GMAIL_FROM?.toLowerCase();
          const matchIndex = userEmail
            ? attendees.findIndex((a) => a.email?.toLowerCase() === userEmail)
            : -1;
          if (matchIndex >= 0) {
            attendees[matchIndex] = {
              ...attendees[matchIndex],
              responseStatus: input.response,
              ...(input.comment ? { comment: input.comment } : {}),
            };
          } else if (userEmail) {
            attendees.push({
              email: userEmail,
              self: true,
              responseStatus: input.response,
              ...(input.comment ? { comment: input.comment } : {}),
            });
          }
        }

        await events.update({
          calendarId: PRIMARY_CALENDAR_ID,
          id: input.eventId,
          event: {
            summary: existing.summary,
            description: existing.description,
            location: existing.location,
            start: existing.start,
            end: existing.end,
            recurrence: existing.recurrence,
            attendees,
          },
        });

        return {
          status: "updated",
          eventId: input.eventId,
        };
      } catch (error) {
        return eventMutationError(error);
      }
    },

    async setOutOfOffice(
      input: CalendarOutOfOfficeInput,
    ): Promise<CalendarEventMutationResult> {
      try {
        const response = await events.create({
          calendarId: PRIMARY_CALENDAR_ID,
          event: {
            summary: input.title,
            description: input.message,
            transparency: "opaque",
            eventType: "outOfOffice",
            start: fromEventTime({
              kind: "dateTime",
              value: input.from,
            }),
            end: fromEventTime({
              kind: "dateTime",
              value: input.to,
            }),
          },
        });

        if (!response.id) {
          return {
            status: "failed",
            error: "Google Calendar did not return an event ID",
          };
        }

        return {
          status: "created",
          eventId: response.id,
        };
      } catch (error) {
        return eventMutationError(error);
      }
    },
  };
}
