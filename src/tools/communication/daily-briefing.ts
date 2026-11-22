import { tool } from "ai";
import { z } from "zod";
import type { DailyBriefingResult } from "../../briefing";

export function createDailyBriefingTool(
  runBriefing: () => Promise<DailyBriefingResult>,
) {
  return tool({
    description:
      "Create a read-only daily briefing from configured Gmail and Slack sources. Returns a formatted summary and actionable items with message IDs and suggested actions (archive, trash, star, draft reply, etc.).",
    inputSchema: z.object({}),
    execute: () => runBriefing(),
  });
}