import { approveDraft, getDraft, type Draft } from "./state";

export type Confirm = (preview: string) => Promise<boolean>;

export function createDraftConfirmation(confirm: Confirm) {
  let confirming = false;

  return async function confirmDraft(draft: Draft, preview: string) {
    if (draft.approved) {
      return { status: "blocked", reason: "This draft was already processed." } as const;
    }

    if (confirming) {
      return { status: "blocked", reason: "Another confirmation is open." } as const;
    }

    confirming = true;

    try {
      if (!(await confirm(preview))) {
        return { status: "declined" } as const;
      }

      // The stored draft must still be the one shown in the preview.
      if (getDraft(draft.id) !== draft || !approveDraft(draft.id)) {
        return { status: "blocked", reason: "Draft changed. Review it again." } as const;
      }

      return { status: "approved" } as const;
    } finally {
      confirming = false;
    }
  };
}

export type ConfirmDraft = ReturnType<typeof createDraftConfirmation>;