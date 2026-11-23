import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createCalendarActionTools, formatToLocal24Hour } from "./calendar-action";
import type {
  CalendarAvailability,
  CalendarCreateEventInput,
  CalendarEvent,
  CalendarEventDetails,
  CalendarEventMutationResult,
  CalendarEventPage,
  CalendarEventResponseInput,
  CalendarListEventsInput,
  CalendarOutOfOfficeInput,
  CalendarRangeInput,
  CalendarRangePage,
  CalendarReader,
  CalendarUpdateEventInput,
  PageRequest,
} from "../../connectors/communication/contracts";

function createMockReader(): {
  reader: CalendarReader;
  createdEvents: CalendarCreateEventInput[];
  updatedEvents: CalendarUpdateEventInput[];
  deletedEvents: string[];
  responses: CalendarEventResponseInput[];
  oooEvents: CalendarOutOfOfficeInput[];
} {
  const createdEvents: CalendarCreateEventInput[] = [];
  const updatedEvents: CalendarUpdateEventInput[] = [];
  const deletedEvents: string[] = [];
  const responses: CalendarEventResponseInput[] = [];
  const oooEvents: CalendarOutOfOfficeInput[] = [];

  const mockEvents: CalendarEvent[] = [
    {
      id: "event-1",
      title: "Sprint Planning",
      start: { kind: "dateTime", value: "2026-11-24T10:00:00Z" },
      end: { kind: "dateTime", value: "2026-11-24T11:00:00Z" },
      status: "confirmed",
      attendeeStatus: "accepted",
    },
    {
      id: "event-2",
      title: "Design Review",
      start: { kind: "dateTime", value: "2026-11-25T14:00:00Z" },
      end: { kind: "dateTime", value: "2026-11-25T15:00:00Z" },
      status: "tentative",
      attendeeStatus: "needsAction", // Pending invite
    },
  ];

  const reader: CalendarReader = {
    async listEvents(input: CalendarListEventsInput): Promise<CalendarEventPage> {
      const items =
        input.filter === "pending"
          ? mockEvents.filter((e) => e.attendeeStatus === "needsAction")
          : mockEvents;
      return { items, skipped: 0 };
    },

    async listEventsInRange(
      input: CalendarRangeInput & PageRequest,
    ): Promise<CalendarRangePage> {
      const items =
        input.filter === "pending"
          ? mockEvents.filter((e) => e.attendeeStatus === "needsAction")
          : mockEvents;
      return { items, skipped: 0 };
    },

    async getEvent(eventId: string): Promise<CalendarEvent | null> {
      return mockEvents.find((e) => e.id === eventId) ?? null;
    },

    async getEventDetails(eventId: string): Promise<CalendarEventDetails | null> {
      const base = mockEvents.find((e) => e.id === eventId);
      if (!base) return null;
      return {
        ...base,
        description: "Review meeting",
        location: "Room 101",
        meetingLink: "https://meet.google.com/abc-xyz",
        attendees: ["alice@example.com", "bob@example.com"],
        status: base.status ?? "confirmed",
      };
    },

    async checkAvailability(): Promise<CalendarAvailability> {
      return {
        status: "available",
        busyPeriods: [],
      };
    },

    async createEvent(
      input: CalendarCreateEventInput,
    ): Promise<CalendarEventMutationResult> {
      createdEvents.push(input);
      return { status: "created", eventId: "new-event-123" };
    },

    async updateEvent(
      input: CalendarUpdateEventInput,
    ): Promise<CalendarEventMutationResult> {
      updatedEvents.push(input);
      return { status: "updated", eventId: input.eventId };
    },

    async deleteEvent(eventId: string): Promise<CalendarEventMutationResult> {
      deletedEvents.push(eventId);
      return { status: "deleted", eventId };
    },

    async respondToEvent(
      input: CalendarEventResponseInput,
    ): Promise<CalendarEventMutationResult> {
      responses.push(input);
      return { status: "updated", eventId: input.eventId };
    },

    async setOutOfOffice(
      input: CalendarOutOfOfficeInput,
    ): Promise<CalendarEventMutationResult> {
      oooEvents.push(input);
      return { status: "created", eventId: "ooo-event-123" };
    },
  };

  return {
    reader,
    createdEvents,
    updatedEvents,
    deletedEvents,
    responses,
    oooEvents,
  };
}

test("calendar list tools support ranges (week, month) and pending invitations", async () => {
  const { reader } = createMockReader();
  const tools = createCalendarActionTools(reader, async () => true);

  // 1. List for single day
  const dayResult = (await (tools.listCalendarEvents as any).execute({
    date: "2026-11-24",
  })) as any;
  assert.equal(dayResult.status, "ok");
  assert.equal(dayResult.items.length, 2);

  // 2. List in range for this_week
  const weekResult = (await (tools.listCalendarEventsInRange as any).execute({
    timeframe: "this_week",
  })) as any;
  assert.equal(weekResult.status, "ok");
  assert.equal(weekResult.items.length, 2);

  // 3. List in range for this_month
  const monthResult = (await (tools.listCalendarEventsInRange as any).execute({
    timeframe: "this_month",
  })) as any;
  assert.equal(monthResult.status, "ok");
  assert.equal(monthResult.items.length, 2);

  // 4. List pending invitations
  const pendingResult = (await (tools.listPendingCalendarInvitations as any).execute({
    timeframe: "this_month",
  })) as any;
  assert.equal(pendingResult.status, "ok");
  assert.equal(pendingResult.pendingCount, 1);
  assert.equal(pendingResult.items[0]?.id, "event-2");
  assert.equal(pendingResult.items[0]?.attendeeStatus, "needsAction");
});

test("calendar write tools enforce confirmation and create/update/delete events", async () => {
  const { reader, createdEvents, updatedEvents, deletedEvents, responses, oooEvents } =
    createMockReader();

  const confirmations: string[] = [];
  const confirm = async (preview: string) => {
    confirmations.push(preview);
    return true;
  };

  const tools = createCalendarActionTools(reader, confirm);

  // Create event with Google Meet conferencing
  const createResult = (await (tools.createCalendarEvent as any).execute({
    title: "Quarterly Planning",
    start: "2026-11-26T10:00:00",
    end: "2026-11-26T11:00:00",
    videoConferencing: "google_meet",
    attendeeEmails: ["colleague@example.com"],
  })) as any;

  assert.equal(createResult.status, "ok");
  assert.equal(createResult.eventId, "new-event-123");
  assert.equal(createdEvents.length, 1);
  assert.equal(createdEvents[0]?.title, "Quarterly Planning");
  assert.equal(createdEvents[0]?.videoConferencing, "google_meet");
  assert.equal(confirmations.length, 1);
  assert.match(confirmations[0]!, /Create event/);
  assert.match(confirmations[0]!, /Video Conference: Google Meet/);
  // Verify 24-hour format (e.g. YYYY-MM-DD HH:mm:ss) without raw UTC 'Z' in Starts/Ends
  assert.match(confirmations[0]!, /Starts: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
  assert.match(confirmations[0]!, /Ends: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
  assert.doesNotMatch(confirmations[0]!, /Starts: .*Z/);

  // Update event
  const updateResult = (await (tools.updateCalendarEvent as any).execute({
    eventId: "event-1",
    videoConferencing: "google_meet",
  })) as any;

  assert.equal(updateResult.status, "ok");
  assert.equal(updatedEvents.length, 1);
  assert.equal(updatedEvents[0]?.videoConferencing, "google_meet");
  // Verifies that start and end are preserved from existing event
  assert.equal(updatedEvents[0]?.start, "2026-11-24T10:00:00Z");
  assert.equal(updatedEvents[0]?.end, "2026-11-24T11:00:00Z");

  // Respond to invitation
  const respondResult = (await (tools.respondToCalendarEvent as any).execute({
    eventId: "event-2",
    response: "accepted",
    comment: "I will attend",
  })) as any;

  assert.equal(respondResult.status, "ok");
  assert.equal(responses.length, 1);
  assert.equal(responses[0]?.response, "accepted");
  assert.equal(responses[0]?.comment, "I will attend");

  // Delete event
  const deleteResult = (await (tools.deleteCalendarEvent as any).execute({
    eventId: "event-1",
  })) as any;

  assert.equal(deleteResult.status, "ok");
  assert.equal(deletedEvents.length, 1);
  assert.equal(deletedEvents[0], "event-1");

  // Set Out of Office
  const oooResult = (await (tools.setCalendarOutOfOffice as any).execute({
    title: "Vacation",
    from: "2026-12-01T09:00:00",
    to: "2026-12-05T18:00:00",
    message: "Out on vacation",
  })) as any;

  assert.equal(oooResult.status, "ok");
  assert.equal(oooEvents.length, 1);
  assert.equal(oooEvents[0]?.title, "Vacation");
});

test("calendar write tools abort when user declines confirmation", async () => {
  const { reader, createdEvents } = createMockReader();
  const tools = createCalendarActionTools(reader, async () => false);

  const result = (await (tools.createCalendarEvent as any).execute({
    title: "Declined Event",
    start: "2026-11-26T10:00:00",
    end: "2026-11-26T11:00:00",
  })) as any;

  assert.equal(result.status, "declined");
  assert.equal(createdEvents.length, 0);
});

test("formatToLocal24Hour formats timestamps into local 24-hour format without UTC Z", () => {
  // 10:00 UTC in Asia/Kolkata (+05:30) is 15:30:00
  const formatted = formatToLocal24Hour("2026-11-24T10:00:00Z", "Asia/Kolkata");
  assert.equal(formatted, "2026-11-24 15:30:00");

  // Date-only remains YYYY-MM-DD
  const dateOnly = formatToLocal24Hour("2026-11-24", "Asia/Kolkata");
  assert.equal(dateOnly, "2026-11-24");
});
