import { randomUUID } from "node:crypto";
import {
  briefingSchema,
  type BriefingClassification,
  type BriefingClassifier,
} from "./classify";
import type {
  BriefingSource,
  BriefingWindow,
  ModelItem,
  SourceTarget,
} from "./types";

export interface SourceCoverage {
  sourceId: string;
  label: string;
  kind: string;
  status: "ok" | "partial" | "failed";
  count: number;
  skipped: number;
  truncated: boolean;
  durationMs: number;
}

export interface BriefingReport {
  runId: string;
  window: BriefingWindow;
  coverage: SourceCoverage[];
  calendarIncluded: boolean;
  items: ModelItem[];
  targets: ReadonlyMap<string, SourceTarget>;
  entries: BriefingClassification["entries"];
  classification: "ok" | "partial" | "failed" | "not_run";
  followUpRecommended: boolean;
}

export async function runBriefing(input: {
  sources: readonly BriefingSource[];
  classify: BriefingClassifier;
  window: BriefingWindow;
}): Promise<BriefingReport> {
  const { sources, classify, window } = input;

  const report: BriefingReport = {
    runId: randomUUID(),
    window,
    coverage: [],
    calendarIncluded: sources.some((source) => source.kind === "calendar"),
    items: [],
    targets: new Map(),
    entries: [],
    classification: "not_run",
    followUpRecommended: false,
  };

  const targets = new Map<string, SourceTarget>();
  const seenTargets = new Set<string>();

  for (const source of sources) {
    const startedAt = Date.now();

    try {
      const batch = await source.collect(window);
      let count = 0;

      for (const item of batch.items) {
        const targetKey = JSON.stringify([
          item.target.provider,
          item.target.connectionId,
          item.target.containerId,
          item.target.itemId,
        ]);

        if (seenTargets.has(targetKey)) continue;
        seenTargets.add(targetKey);

        const ref = `item-${report.items.length + 1}`;

        targets.set(ref, item.target);
        report.items.push({
          ref,
          kind: source.kind,
          title: item.title.slice(0, 180),
          excerpt: item.excerpt.slice(0, 600),
          occurredAt: item.occurredAt,
        });

        count++;
      }

      const status =
        batch.skipped > 0 || batch.truncated ? "partial" : "ok";

      report.coverage.push({
        sourceId: source.id,
        label: source.label,
        kind: source.kind,
        status,
        count,
        skipped: batch.skipped,
        truncated: batch.truncated,
        durationMs: Date.now() - startedAt,
      });

      if (batch.truncated) {
        report.followUpRecommended = true;
      }
    } catch {
      report.coverage.push({
        sourceId: source.id,
        label: source.label,
        kind: source.kind,
        status: "failed",
        count: 0,
        skipped: 0,
        truncated: false,
        durationMs: Date.now() - startedAt,
      });
    }
  }

  report.targets = targets;

  if (report.items.length === 0) {
    return report;
  }

  try {
    const output = briefingSchema.parse(await classify(report.items));
    const usedRefs = new Set<string>();

    for (const entry of output.entries) {
      if (!targets.has(entry.ref) || usedRefs.has(entry.ref)) continue;

      usedRefs.add(entry.ref);
      report.entries.push(entry);
    }

    report.classification =
      usedRefs.size === report.items.length &&
      usedRefs.size === output.entries.length
        ? "ok"
        : "partial";

    if (report.classification === "partial") {
      report.followUpRecommended = true;
    }
  } catch {
    report.classification = "failed";
    report.followUpRecommended = true;
  }

  console.info("[briefing]", {
    runId: report.runId,
    itemCount: report.items.length,
    classification: report.classification,
    followUpRecommended: report.followUpRecommended,
    coverage: report.coverage.map((coverage) => ({
      sourceId: coverage.sourceId,
      status: coverage.status,
      count: coverage.count,
      skipped: coverage.skipped,
      truncated: coverage.truncated,
      durationMs: coverage.durationMs,
    })),
  });

  return report;
}