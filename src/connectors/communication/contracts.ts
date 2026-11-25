export interface PageRequest {
  limit: number;
  cursor?: string | undefined;
}

export interface Page<T> {
  items: T[];
  nextCursor?: string;
}

export interface MailMessageRef {
  id: string;
  threadId?: string;
}

export interface MailMessageMetadata {
  id: string;
  threadId?: string;
  subject?: string;
  from?: string;
  replyTo?: string;
  messageIdHeader?: string;
  referencesHeader?: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  text?: string;
  authorId?: string;
}

export interface MailReader {
  listMessages(input: PageRequest): Promise<Page<MailMessageRef>>;
  getMessage?(messageId: string): Promise<MailMessageMetadata | null>;
}

export interface ChatReader {
  listMessages(
    input: PageRequest & { conversationId: string },
  ): Promise<Page<ChatMessage>>;
}

export interface SendMailParams {
  to: string;
  subject: string;
  body: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
}

export interface SendMailResult {
  messageId: string;
}

export interface MailSender {
  send(params: SendMailParams): Promise<SendMailResult>;
}

export interface SendChatParams {
  conversationId: string;
  body: string;
  threadTs?: string;
}

export interface SendChatResult {
  messageId: string;
}

export interface ChatSender {
  send(params: SendChatParams): Promise<SendChatResult>;
}


export type MailAction =
  | "archive"
  | "mark_read"
  | "mark_unread"
  | "star"
  | "unstar"
  | "trash"
  | "untrash";

export interface MailMessageActionInput {
  messageId: string;
}

export interface MailLabelChangeInput {
  messageId: string;
  addLabelIds: string[];
  removeLabelIds: string[];
}

export interface MailActionResult {
  status: "applied" | "failed";
  messageId: string;
  action: MailAction;
  error?: string;
}

export interface MailLabelChangeResult {
  status: "applied" | "failed";
  messageId: string;
  addLabelIds: string[];
  removeLabelIds: string[];
  error?: string;
}

export interface MailActions {
  archiveMessage(
    input: MailMessageActionInput,
  ): Promise<MailActionResult>;

  markAsRead(
    input: MailMessageActionInput,
  ): Promise<MailActionResult>;

  markAsUnread(
    input: MailMessageActionInput,
  ): Promise<MailActionResult>;

  starMessage(
    input: MailMessageActionInput,
  ): Promise<MailActionResult>;

  unstarMessage(
    input: MailMessageActionInput,
  ): Promise<MailActionResult>;

  trashMessage(
    input: MailMessageActionInput,
  ): Promise<MailActionResult>;

  untrashMessage(
    input: MailMessageActionInput,
  ): Promise<MailActionResult>;

  modifyLabels(
    input: MailLabelChangeInput,
  ): Promise<MailLabelChangeResult>;
}

export type CalendarEventTime =
  | { kind: "date"; value: string }
  | { kind: "dateTime"; value: string };

export interface CalendarEvent {
  id: string;
  title: string;
  start: CalendarEventTime;
  end: CalendarEventTime;
  location?: string;
  status?: "confirmed" | "tentative" | "cancelled";
  attendeeStatus?: "needsAction" | "accepted" | "declined" | "tentative";
  isOrganizer?: boolean;
}

export interface CalendarListEventsInput extends PageRequest {
  from: string;
  to: string;
  timeZone: string;
  filter?: "all" | "pending";
}

export interface CalendarEventPage extends Page<CalendarEvent> {
  skipped: number;
}

export interface CalendarRangeInput {
  from: string;
  to: string;
  timeZone: string;
  filter?: "all" | "pending";
}

export interface CalendarRangePage extends Page<CalendarEvent> {
  skipped: number;
}

export interface CalendarEventDetails extends CalendarEvent {
  description?: string;
  location?: string;
  meetingLink?: string;
  attendees?: string[];
  status: "confirmed" | "tentative" | "cancelled";
}

export interface CalendarAvailabilityInput {
  from: string;
  to: string;
  timeZone: string;
  attendeeEmails: string[];
}

export interface CalendarAvailability {
  status: "available" | "unavailable" | "unknown";
  busyPeriods: {
    from: string;
    to: string;
  }[];
  error?: string;
}

export interface CalendarCreateEventInput {
  title: string;
  start: string;
  end: string;
  timeZone: string;
  description?: string;
  location?: string;
  attendeeEmails?: string[];
  videoConferencing?: "google_meet" | "none";
  meetingLink?: string;
}

export interface CalendarUpdateEventInput {
  eventId: string;
  title?: string;
  start?: string;
  end?: string;
  timeZone?: string;
  description?: string;
  location?: string;
  attendeeEmails?: string[];
  videoConferencing?: "google_meet" | "none";
  meetingLink?: string;
}

export interface CalendarEventMutationResult {
  status: "created" | "updated" | "deleted" | "failed";
  eventId?: string;
  meetingLink?: string;
  error?: string;
}

export interface CalendarEventResponseInput {
  eventId: string;
  response: "accepted" | "declined" | "tentative";
  comment?: string;
}

export interface CalendarOutOfOfficeInput {
  title: string;
  from: string;
  to: string;
  timeZone: string;
  message?: string;
}

export interface CalendarReader {
  listEvents(
    input: CalendarListEventsInput,
  ): Promise<CalendarEventPage>;

  listEventsInRange(
    input: CalendarRangeInput & PageRequest,
  ): Promise<CalendarRangePage>;

  getEvent(eventId: string): Promise<CalendarEvent | null>;

  getEventDetails(
    eventId: string,
  ): Promise<CalendarEventDetails | null>;

  checkAvailability(
    input: CalendarAvailabilityInput,
  ): Promise<CalendarAvailability>;

  createEvent(
    input: CalendarCreateEventInput,
  ): Promise<CalendarEventMutationResult>;

  updateEvent(
    input: CalendarUpdateEventInput,
  ): Promise<CalendarEventMutationResult>;

  deleteEvent(eventId: string): Promise<CalendarEventMutationResult>;

  respondToEvent(
    input: CalendarEventResponseInput,
  ): Promise<CalendarEventMutationResult>;

  setOutOfOffice(
    input: CalendarOutOfOfficeInput,
  ): Promise<CalendarEventMutationResult>;
}