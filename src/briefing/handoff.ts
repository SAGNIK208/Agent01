import type { BriefingCategory } from "./classify";
import type { BriefingReport } from "./run";
import type { SourceKind, SourceTarget } from "./types";

export interface ActionableBriefingItem {
  ref: string;
  kind: SourceKind;
  provider: string;
  title: string;
  category: BriefingCategory | "unclassified";
  explanation: string;
  occurredAt: string;
  messageId?: string;
  threadId?: string;
  channelId?: string;
  messageTs?: string;
  sender?: string;
  authorId?: string;
  suggestedActions: string[];
}

export interface DailyBriefingResult {
  summary: string;
  items: ActionableBriefingItem[];
  runId: string;
  classification: "ok" | "partial" | "failed" | "not_run";
  followUpRecommended: boolean;
}

const recentTargets = new Map<string, SourceTarget>();

export function registerBriefingTargets(
  targets: ReadonlyMap<string, SourceTarget>,
): void {
  for (const [ref, target] of targets.entries()) {
    recentTargets.set(ref, target);
  }
}

export function resolveBriefingTarget(
  refOrId: string,
): SourceTarget | undefined {
  return recentTargets.get(refOrId);
}

export function resolveBriefingMessageId(refOrId: string): string {
  const target = recentTargets.get(refOrId);
  if (target && target.provider === "gmail") {
    return target.itemId;
  }
  return refOrId;
}

export function resolveBriefingChannelId(refOrId: string): string {
  const target = recentTargets.get(refOrId);
  if (target && target.provider === "slack" && target.containerId) {
    return target.containerId;
  }
  return refOrId;
}

export function buildActionableItems(
  report: BriefingReport,
): ActionableBriefingItem[] {
  const entryByRef = new Map(report.entries.map((e) => [e.ref, e]));

  return report.items.map((item) => {
    const target = report.targets.get(item.ref);
    const entry = entryByRef.get(item.ref);
    const category = entry?.category ?? "unclassified";
    const explanation = entry?.explanation ?? "";

    const suggestedActions: string[] = [];
    if (item.kind === "mail") {
      switch (category) {
        case "suspected_spam":
          suggestedActions.push("trashMailMessage", "archiveMailMessage");
          break;
        case "ignore":
          suggestedActions.push("archiveMailMessage", "markMailMessageRead");
          break;
        case "fyi":
          suggestedActions.push("markMailMessageRead", "archiveMailMessage");
          break;
        case "needs_attention":
        case "approval_requested":
          suggestedActions.push(
            "draftEmail",
            "starMailMessage",
            "markMailMessageRead",
          );
          break;
        default:
          suggestedActions.push("archiveMailMessage", "starMailMessage");
      }
    } else if (item.kind === "chat") {
      if (category === "needs_attention" || category === "approval_requested") {
        suggestedActions.push("draftChatMessage");
      }
    }

    return {
      ref: item.ref,
      kind: item.kind,
      provider: target?.provider ?? (item.kind === "mail" ? "gmail" : "slack"),
      title: item.title,
      category,
      explanation,
      occurredAt: item.occurredAt,
      ...(item.kind === "mail"
        ? {
            messageId: target?.itemId,
            threadId: target?.containerId,
            ...(target?.sender ? { sender: target.sender } : {}),
          }
        : {
            channelId: target?.containerId,
            messageTs: target?.itemId,
            ...(target?.authorId ? { authorId: target.authorId } : {}),
          }),
      suggestedActions,
    };
  });
}
