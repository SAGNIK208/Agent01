import { tool } from "ai";
import { z } from "zod";
import { getDraft, listDrafts } from "../../agent/state";

export const viewDraft = tool({
  description:
    "View or list existing local drafts (e.g. email or Slack message drafts). Use this when the user asks to see, show, or review a draft.",
  inputSchema: z.object({
    draftId: z
      .string()
      .optional()
      .describe("Optional draft ID. If omitted, returns all unsent drafts."),
    connector: z
      .enum(["mail", "chat"])
      .optional()
      .describe("Optional connector filter ('mail' or 'chat')."),
  }),
  execute: async ({ draftId, connector }) => {
    if (draftId) {
      const draft = getDraft(draftId);
      if (!draft) {
        return {
          status: "not_found",
          draftId,
          activeDrafts: listDrafts(connector),
        };
      }
      return { status: "ok", draft };
    }

    return {
      status: "ok",
      drafts: listDrafts(connector),
    };
  },
});
