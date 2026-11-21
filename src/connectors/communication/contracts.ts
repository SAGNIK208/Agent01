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

export interface ChatMessage {
  id: string;
  conversationId: string;
  text?: string;
  authorId?: string;
}

export interface MailReader {
  listMessages(input: PageRequest): Promise<Page<MailMessageRef>>;
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