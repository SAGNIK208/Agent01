import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  buildActionableItems,
  registerBriefingTargets,
  resolveBriefingChannelId,
  resolveBriefingEventId,
  resolveBriefingMessageId,
} from "./handoff";
import type { BriefingReport } from "./run";
import type { CheckpointStore, SourceTarget } from "./types";
import { createDailyBriefing } from "./index";

test("handoff resolves item references to underlying message IDs and channel IDs", () => {
  const targets = new Map<string, SourceTarget>([
    [
      "item-1",
      {
        provider: "gmail",
        connectionId: "default",
        itemId: "gmail-msg-123",
        containerId: "thread-456",
        sender: "boss@example.com",
      },
    ],
    [
      "item-2",
      {
        provider: "slack",
        connectionId: "default",
        itemId: "1700000000.000100",
        containerId: "C12345678",
        authorId: "U999",
      },
    ],
    [
      "item-3",
      {
        provider: "google-calendar",
        connectionId: "default",
        itemId: "gcal-event-789",
      },
    ],
  ]);

  registerBriefingTargets(targets);

  assert.equal(resolveBriefingMessageId("item-1"), "gmail-msg-123");
  assert.equal(resolveBriefingMessageId("raw-msg-id"), "raw-msg-id");

  assert.equal(resolveBriefingChannelId("item-2"), "C12345678");
  assert.equal(resolveBriefingChannelId("C99999999"), "C99999999");

  assert.equal(resolveBriefingEventId("item-3"), "gcal-event-789");
  assert.equal(resolveBriefingEventId("raw-event-id"), "raw-event-id");
});

test("buildActionableItems constructs actionable items with suggested tools", () => {
  const report: BriefingReport = {
    runId: "run-test",
    window: {
      timeZone: "Asia/Kolkata",
      from: "2026-11-21T00:00:00.000Z",
      now: "2026-11-22T00:00:00.000Z",
    },
    coverage: [],
    calendarIncluded: false,
    items: [
      {
        ref: "item-1",
        kind: "mail",
        title: "Spam Offer",
        excerpt: "Win big money",
        occurredAt: "2026-11-21T10:00:00.000Z",
      },
      {
        ref: "item-2",
        kind: "mail",
        title: "Important PR",
        excerpt: "Please review",
        occurredAt: "2026-11-21T11:00:00.000Z",
      },
      {
        ref: "item-3",
        kind: "chat",
        title: "Message in #dev",
        excerpt: "Deploy failed",
        occurredAt: "2026-11-21T12:00:00.000Z",
      },
      {
        ref: "item-4",
        kind: "calendar",
        title: "Conflict Meeting",
        excerpt: "Potential overlap with Team Sync",
        occurredAt: "2026-11-21T14:00:00.000Z",
      },
    ],
    targets: new Map([
      [
        "item-1",
        {
          provider: "gmail",
          connectionId: "default",
          itemId: "msg-spam",
        },
      ],
      [
        "item-2",
        {
          provider: "gmail",
          connectionId: "default",
          itemId: "msg-pr",
          sender: "alice@example.com",
        },
      ],
      [
        "item-3",
        {
          provider: "slack",
          connectionId: "default",
          itemId: "1700000000.123",
          containerId: "C_DEV",
        },
      ],
      [
        "item-4",
        {
          provider: "google-calendar",
          connectionId: "default",
          itemId: "gcal-conflict-123",
        },
      ],
    ]),
    entries: [
      {
        ref: "item-1",
        category: "suspected_spam",
        explanation: "Phishing attempt",
      },
      {
        ref: "item-2",
        category: "approval_requested",
        explanation: "Alice wants review",
      },
      {
        ref: "item-3",
        category: "needs_attention",
        explanation: "CI pipeline broken",
      },
      {
        ref: "item-4",
        category: "needs_attention",
        explanation: "Overlapping schedule",
      },
    ],
    classification: "ok",
    followUpRecommended: false,
  };

  const actionable = buildActionableItems(report);

  assert.equal(actionable.length, 4);

  // item-1: spam
  assert.equal(actionable[0]?.ref, "item-1");
  assert.equal(actionable[0]?.messageId, "msg-spam");
  assert.equal(actionable[0]?.category, "suspected_spam");
  assert.deepEqual(actionable[0]?.suggestedActions, [
    "trashMailMessage",
    "archiveMailMessage",
  ]);

  // item-2: approval requested email
  assert.equal(actionable[1]?.ref, "item-2");
  assert.equal(actionable[1]?.messageId, "msg-pr");
  assert.equal(actionable[1]?.sender, "alice@example.com");
  assert.equal(actionable[1]?.category, "approval_requested");
  assert.ok(actionable[1]?.suggestedActions.includes("draftEmailReply"));
  assert.ok(actionable[1]?.suggestedActions.includes("draftEmail"));

  // item-3: slack attention
  assert.equal(actionable[2]?.ref, "item-3");
  assert.equal(actionable[2]?.channelId, "C_DEV");
  assert.equal(actionable[2]?.category, "needs_attention");
  assert.deepEqual(actionable[2]?.suggestedActions, [
    "draftChatReply",
    "draftChatMessage",
  ]);

  // item-4: calendar attention
  assert.equal(actionable[3]?.ref, "item-4");
  assert.equal(actionable[3]?.eventId, "gcal-conflict-123");
  assert.equal(actionable[3]?.provider, "google-calendar");
  assert.equal(actionable[3]?.category, "needs_attention");
  assert.ok(actionable[3]?.suggestedActions.includes("getCalendarEventDetails"));
  assert.ok(actionable[3]?.suggestedActions.includes("updateCalendarEvent"));
});

test("createDailyBriefing updates checkpoints after successful run", async () => {
  const savedCheckpoints: Record<string, unknown> = {};

  const mockCheckpoints: CheckpointStore = {
    get: async () => null,
    save: async ({ sourceKind, sourceKey, checkpoint }) => {
      savedCheckpoints[`${sourceKind}:${sourceKey}`] = checkpoint;
    },
  };

  const briefing = createDailyBriefing({
    classify: async () => ({
      entries: [
        {
          ref: "item-1",
          category: "needs_attention",
          explanation: "Critical email",
        },
      ],
    }),
    checkpoints: mockCheckpoints,
    tenantId: "test-tenant",
    sources: [
      {
        id: "gmail",
        label: "Gmail",
        kind: "mail",
        collect: async () => ({
          skipped: 0,
          truncated: false,
          items: [
            {
              title: "Urgent email",
              excerpt: "Please reply",
              occurredAt: "2026-11-22T02:00:00.000Z",
              target: {
                provider: "gmail",
                connectionId: "default",
                itemId: "latest-gmail-id",
              },
            },
          ],
        }),
      },
    ],
  });

  const result = await briefing();

  assert.equal(result.classification, "ok");
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.messageId, "latest-gmail-id");
  assert.ok("mail:gmail" in savedCheckpoints);
  assert.equal(
    (savedCheckpoints["mail:gmail"] as any).lastItemId,
    "latest-gmail-id",
  );
});
