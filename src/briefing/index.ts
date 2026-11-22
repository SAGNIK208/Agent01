import { createBriefingClassifier } from "./classify";
import { checkpointKeyForSlackChannel } from "./checkpoints";
import {
  buildActionableItems,
  registerBriefingTargets,
  type DailyBriefingResult,
} from "./handoff";
import { renderBriefing } from "./render";
import { runBriefing, type BriefingReport } from "./run";
import { todayWindow } from "./window";
import { requireTimeZone } from "../system/timezone";
import type { BriefingSource, CheckpointStore } from "./types";

export { createGmailBriefingSource } from "./gmail-source";
export {
  createSlackBriefingSource,
  createSlackChannelDiscovery,
} from "./slack-source";
export {
  checkpointKeyForSlackChannel,
  createSqliteCheckpointStore,
} from "./checkpoints";
export {
  registerBriefingTargets,
  resolveBriefingChannelId,
  resolveBriefingMessageId,
  resolveBriefingTarget,
  type ActionableBriefingItem,
  type DailyBriefingResult,
} from "./handoff";

async function advanceCheckpoints(
  report: BriefingReport,
  checkpoints: CheckpointStore,
  tenantId: string,
): Promise<void> {
  if (report.classification !== "ok" && report.classification !== "partial") {
    return;
  }

  let latestGmail: { itemId: string; time: string; timeMs: number } | null = null;
  const latestSlackByChannel = new Map<
    string,
    { itemId: string; time: string; timeMs: number }
  >();

  for (const item of report.items) {
    const target = report.targets.get(item.ref);
    if (!target) continue;

    const timeMs = Date.parse(item.occurredAt);
    if (!Number.isFinite(timeMs)) continue;

    if (target.provider === "gmail") {
      if (!latestGmail || timeMs > latestGmail.timeMs) {
        latestGmail = { itemId: target.itemId, time: item.occurredAt, timeMs };
      }
    } else if (target.provider === "slack" && target.containerId) {
      const existing = latestSlackByChannel.get(target.containerId);
      if (!existing || timeMs > existing.timeMs) {
        latestSlackByChannel.set(target.containerId, {
          itemId: target.itemId,
          time: item.occurredAt,
          timeMs,
        });
      }
    }
  }

  const nowIso = new Date().toISOString();

  if (latestGmail) {
    await checkpoints.save({
      tenantId,
      sourceKind: "mail",
      sourceKey: "gmail",
      checkpoint: {
        lastItemId: latestGmail.itemId,
        lastItemTime: latestGmail.time,
        updatedAt: nowIso,
      },
    });
  }

  for (const [channelId, latest] of latestSlackByChannel.entries()) {
    await checkpoints.save({
      tenantId,
      sourceKind: "chat",
      sourceKey: checkpointKeyForSlackChannel(channelId),
      checkpoint: {
        lastItemId: latest.itemId,
        lastItemTime: latest.time,
        updatedAt: nowIso,
      },
    });
  }
}

export function createDailyBriefing(input: {
  model?: Parameters<typeof createBriefingClassifier>[0];
  classify?: Parameters<typeof runBriefing>[0]["classify"];
  sources: readonly BriefingSource[];
  checkpoints: CheckpointStore;
  tenantId?: string;
}) {
  const timeZone = requireTimeZone();
  const tenantId = input.tenantId ?? "default";
  const classify =
    input.classify ??
    (input.model
      ? createBriefingClassifier(input.model)
      : (() => {
          throw new Error("Either model or classify must be provided to createDailyBriefing.");
        })());

  return async (): Promise<DailyBriefingResult> => {
    const window = todayWindow(timeZone);

    const report = await runBriefing({
      sources: input.sources,
      classify,
      window,
    });

    await advanceCheckpoints(report, input.checkpoints, tenantId);
    registerBriefingTargets(report.targets);

    return {
      summary: renderBriefing(report),
      items: buildActionableItems(report),
      runId: report.runId,
      classification: report.classification,
      followUpRecommended: report.followUpRecommended,
    };
  };
}