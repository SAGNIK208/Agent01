import { randomUUID } from "node:crypto";
import { tool } from "ai";
import { z } from "zod";
import { saveDraft } from "../../agent/state";

export const draftEmail = tool({
  description: "Create a local email draft. Does not send anything.",
  inputSchema: z.object({
    to: z.string().trim().email(),
    subject: z.string().trim().min(1),
    body: z.string().trim().min(1),
  }),
  execute: async ({ to, subject, body }) => {
    const draft = saveDraft({
      id: randomUUID(),
      connector: "mail",
      to,
      subject,
      body,
      approved: false,
    });

    return { draftId: draft.id, to, subject, body };
  },
});