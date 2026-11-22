import type { BriefingReport } from "./run";

const sectionNames = {
  approval_requested: "Approval requested",
  needs_attention: "Needs attention",
  fyi: "FYI",
  ignore: "Low priority",
  suspected_spam: "Suspected spam",
} as const;

function oneLine(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function renderBriefing(report: BriefingReport): string {
  const lines = [
    "Daily briefing",
    `Period: ${report.window.from} to ${report.window.now} (${report.window.timeZone})`,
    "",
    "Coverage",
  ];

  for (const coverage of report.coverage) {
    if (coverage.status === "failed") {
      lines.push(`- ${coverage.label}: could not read`);
      continue;
    }

    lines.push(
      `- ${coverage.label}: ${coverage.count} included` +
        (coverage.truncated ? ", more available" : "") +
        (coverage.skipped ? `, ${coverage.skipped} skipped` : ""),
    );
  }

  const mailItems = report.items.filter((item) => item.kind === "mail");
  const chatItems = report.items.filter((item) => item.kind === "chat");

  if (mailItems.length > 0) {
    const latestMail = mailItems.reduce((latest, item) =>
      Date.parse(item.occurredAt) > Date.parse(latest.occurredAt) ? item : latest,
    );
    lines.push(
      `- Latest mail included: ${oneLine(latestMail.title)} (${latestMail.occurredAt})`,
    );
  }

  if (chatItems.length > 0) {
    const latestChat = chatItems.reduce((latest, item) =>
      Date.parse(item.occurredAt) > Date.parse(latest.occurredAt) ? item : latest,
    );
    lines.push(
      `- Latest Slack message included: ${oneLine(latestChat.title)} (${latestChat.occurredAt})`,
    );
  }

  if (!report.calendarIncluded) {
    lines.push("- Calendar not included.");
  }

  if (report.followUpRecommended) {
    lines.push("", "Another bounded briefing run is recommended.");
  }

  if (report.classification === "failed") {
    lines.push("", "Classification was unavailable. No categories were assigned.");
  } else if (report.classification === "partial") {
    lines.push(
      "",
      `Classification incomplete: ${
        report.items.length - report.entries.length
      } item(s) unclassified or invalid.`,
    );
  }

  const itemByRef = new Map(
    report.items.map((item) => [item.ref, item]),
  );

  for (const [category, heading] of Object.entries(sectionNames)) {
    const entries = report.entries.filter(
      (entry) => entry.category === category,
    );

    if (entries.length === 0) continue;

    lines.push("", heading);

    for (const entry of entries) {
      const item = itemByRef.get(entry.ref);
      if (!item) continue;

      lines.push(
        `- [${item.ref}] ${oneLine(item.title)} — ${oneLine(
          entry.explanation,
        ).slice(0, 300)}`,
      );
    }
  }

  lines.push(
    "",
    `Run: ${report.runId}. No email or Slack message was changed, sent, archived, or deleted.`,
  );

  return lines.join("\n");
}