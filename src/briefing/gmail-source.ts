import type { corsair } from "../connectors/corsair";
import type {
  BriefingSource,
  BriefingWindow,
  CheckpointStore,
  SourceBatch,
  SourceItem,
} from "./types";

type GmailMessagesApi = Pick<
  typeof corsair.gmail.api.messages,
  "list" | "get"
>;

const GMAIL_BUFFER_MS = 5 * 60 * 1000;
const GMAIL_MAX_ITEMS = 20;
const EXCERPT_LENGTH = 600;

function toMilliseconds(
  value: string | number | Date | null | undefined,
): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value !== "string" || !value.trim()) return NaN;
  return /^\d+$/.test(value) ? Number(value) : Date.parse(value);
}

function normalizeExcerpt(value: string | undefined): string {
  return (value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, EXCERPT_LENGTH);
}

function headerValue(
  headers: { name?: string; value?: string }[] | undefined,
  name: string,
): string | undefined {
  return headers?.find(
    (header) => header.name?.toLowerCase() === name.toLowerCase(),
  )?.value;
}

export function createGmailBriefingSource(input: {
  api: GmailMessagesApi;
  connectionId: string;
  tenantId: string;
  checkpoints: CheckpointStore;
}): BriefingSource {
  const { api, connectionId, tenantId, checkpoints } = input;

  return {
    id: "gmail",
    label: "Gmail",
    kind: "mail",

    async collect(window: BriefingWindow): Promise<SourceBatch> {
      const nowMs = Date.parse(window.now);
      const checkpoint = await checkpoints.get({
        tenantId,
        sourceKind: "mail",
        sourceKey: "gmail",
      });

      const checkpointTime = checkpoint
        ? Date.parse(checkpoint.lastItemTime)
        : Number.NaN;

      const fromMs = Number.isFinite(checkpointTime)
        ? checkpointTime - GMAIL_BUFFER_MS
        : nowMs - 24 * 60 * 60 * 1000;

      const after = Math.floor(fromMs / 1000) - 1;
      const before = Math.floor(nowMs / 1000) + 1;

      const listed = await api.list({
        userId: "me",
        maxResults: GMAIL_MAX_ITEMS,
        q: `after:${after} before:${before} -in:sent -in:drafts`,
        includeSpamTrash: false,
      });

      const items: SourceItem[] = [];
      let skipped = 0;
      let readCount = 0;

      for (const reference of (listed.messages ?? []).slice(0, GMAIL_MAX_ITEMS)) {
        if (!reference.id) {
          skipped++;
          continue;
        }

        try {
          const message = await api.get({
            userId: "me",
            id: reference.id,
            format: "full",
          });

          const occurredAtMs = toMilliseconds(message.internalDate);

          if (!Number.isFinite(occurredAtMs)) {
            skipped++;
            continue;
          }

          if (occurredAtMs < fromMs || occurredAtMs >= nowMs) {
            continue;
          }

          readCount++;

          const from = headerValue(message.payload?.headers, "From");
          const subject =
            headerValue(message.payload?.headers, "Subject") ||
            "(No subject)";

          items.push({
            title: from ? `${from}: ${subject}` : subject,
            excerpt: normalizeExcerpt(message.snippet),
            occurredAt: new Date(occurredAtMs).toISOString(),
            target: {
              provider: "gmail",
              connectionId,
              itemId: reference.id,
              ...(message.threadId
                ? { containerId: message.threadId }
                : {}),
              ...(from ? { sender: from } : {}),
            },
          });
        } catch {
          skipped++;
        }
      }

      if (readCount === 0 && skipped > 0) {
        throw new Error("No Gmail message details could be read.");
      }

      return {
        items,
        skipped,
        truncated: Boolean(listed.nextPageToken),
      };
    },
  };
}