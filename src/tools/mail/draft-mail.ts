import { randomUUID } from "node:crypto";
import { tool } from "ai";
import { z } from "zod";
import { saveDraft } from "../../agent/state";
import {
  resolveBriefingMessageId,
  resolveBriefingSender,
  resolveBriefingTarget,
  resolveBriefingThreadId,
} from "../../briefing";
import type { MailReader } from "../../connectors/communication/contracts";

function cleanEmail(rawEmail: string): string {
  const match = rawEmail.match(/<([^>]+)>/);
  return match && match[1] ? match[1].trim() : rawEmail.trim();
}

function formatReplySubject(subject: string): string {
  const trimmed = subject.trim();
  return /^re:/i.test(trimmed) ? trimmed : `Re: ${trimmed}`;
}

export function createMailDraftTools(mailReader: Pick<MailReader, "getMessage">) {
  const draftEmail = tool({
    description:
      "Create a local email draft. Does not send anything. " +
      "Can start a new email thread or reply to an existing email thread using replyTo (briefing item ref like 'item-4' or message ID) or threadId.",
    inputSchema: z.object({
      to: z
        .string()
        .trim()
        .describe(
          "Recipient email address or briefing item reference (e.g. 'item-4').",
        ),
      subject: z.string().trim().min(1).describe("Email subject line."),
      body: z.string().trim().min(1).describe("Email body content."),
      replyTo: z
        .string()
        .trim()
        .optional()
        .describe(
          "Optional briefing item reference (e.g. 'item-4') or message ID to reply directly to an existing email thread.",
        ),
      threadId: z
        .string()
        .trim()
        .optional()
        .describe("Optional Gmail thread ID to attach this message to."),
    }),
    execute: async ({ to: rawTo, subject, body, replyTo, threadId }) => {
      let to = rawTo;
      let resolvedThreadId = threadId;
      let resolvedInReplyTo: string | undefined;
      let resolvedReferences: string | undefined;

      const targetRef = replyTo ?? (rawTo.startsWith("item-") ? rawTo : undefined);
      if (targetRef) {
        const target = resolveBriefingTarget(targetRef);
        const messageId = resolveBriefingMessageId(targetRef);
        const parent = mailReader.getMessage
          ? await mailReader.getMessage(messageId)
          : null;

        if (replyTo && !parent) {
          return {
            status: "error" as const,
            reason: `Could not resolve parent email message for ${replyTo}.`,
          };
        }

        if (parent) {
          resolvedThreadId = resolvedThreadId ?? parent.threadId ?? target?.containerId;
          resolvedInReplyTo = parent.messageIdHeader;
          resolvedReferences = parent.referencesHeader;
          const parentRecipient = parent.replyTo ?? parent.from ?? target?.sender;
          if (parentRecipient && (to.startsWith("item-") || !to.includes("@"))) {
            to = parentRecipient;
          }
        } else if (target && target.provider === "gmail") {
          if (target.sender && (to.startsWith("item-") || !to.includes("@"))) {
            to = target.sender;
          }
          resolvedThreadId = resolvedThreadId ?? target.containerId;
        } else {
          resolvedThreadId = resolvedThreadId ?? resolveBriefingThreadId(targetRef);
          const sender = resolveBriefingSender(targetRef);
          if (sender && (to.startsWith("item-") || !to.includes("@"))) {
            to = sender;
          }
        }
      }

      to = cleanEmail(to);

      const draft = saveDraft({
        id: randomUUID(),
        connector: "mail",
        to,
        subject,
        body,
        approved: false,
        threadId: resolvedThreadId,
        inReplyTo: resolvedInReplyTo,
        references: resolvedReferences,
      });

      return {
        draftId: draft.id,
        to,
        subject,
        body,
        isReply: Boolean(resolvedThreadId || resolvedInReplyTo),
        threadId: resolvedThreadId,
      };
    },
  });

  const draftEmailReply = tool({
    description:
      "Create a local email draft as a direct reply in an existing email thread (e.g. for approving requests or replying to emails from daily briefing). Does not send anything.",
    inputSchema: z.object({
      replyTo: z
        .string()
        .trim()
        .min(1)
        .describe(
          "Briefing item reference (e.g. 'item-4') or message ID being replied to.",
        ),
      body: z.string().trim().min(1).describe("Email reply body content."),
      subject: z
        .string()
        .trim()
        .optional()
        .describe("Optional subject override (e.g. 'Re: ...'). If omitted, derived from the parent email's Subject header."),
      to: z
        .string()
        .trim()
        .optional()
        .describe(
          "Optional recipient email address override. Defaults to the parent email's Reply-To or From header.",
        ),
    }),
    execute: async ({ replyTo, body, subject: rawSubject, to: explicitTo }) => {
      const target = resolveBriefingTarget(replyTo);
      const messageId = resolveBriefingMessageId(replyTo);
      const parent = mailReader.getMessage
        ? await mailReader.getMessage(messageId)
        : null;

      if (!parent) {
        return {
          status: "error" as const,
          reason: `Could not resolve parent email message for ${replyTo}.`,
        };
      }

      const threadId = parent.threadId ?? target?.containerId ?? resolveBriefingThreadId(replyTo);
      const rawTo = explicitTo ?? parent.replyTo ?? parent.from ?? target?.sender ?? resolveBriefingSender(replyTo);

      if (!rawTo) {
        return {
          status: "error" as const,
          reason: `Could not determine recipient email for ${replyTo}. Please supply 'to'.`,
        };
      }

      const subject = rawSubject
        ? rawSubject
        : parent.subject
          ? formatReplySubject(parent.subject)
          : undefined;

      if (!subject) {
        return {
          status: "error" as const,
          reason: `Could not determine subject from parent email for ${replyTo}. Please supply 'subject'.`,
        };
      }

      const to = cleanEmail(rawTo);

      const draft = saveDraft({
        id: randomUUID(),
        connector: "mail",
        to,
        subject,
        body,
        approved: false,
        threadId,
        inReplyTo: parent.messageIdHeader,
        references: parent.referencesHeader,
      });

      return {
        status: "drafted" as const,
        draftId: draft.id,
        to,
        subject,
        body,
        isReply: true,
        threadId,
        inReplyTo: parent.messageIdHeader,
      };
    },
  });

  return { draftEmail, draftEmailReply };
}
