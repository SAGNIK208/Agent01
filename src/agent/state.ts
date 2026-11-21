export type Connector = "mail" | "chat";

export type Draft = {
  id: string;
  connector: Connector;
  to?: string;
  channel?: string;
  subject?: string;
  body: string;
  approved: boolean;
};

const drafts = new Map<string, Draft>();

export function saveDraft(draft: Draft): Draft {
  drafts.set(draft.id, draft);
  return draft;
}

export function getDraft(id: string): Draft | undefined {
  return drafts.get(id);
}

export function approveDraft(id: string): boolean {
  const draft = drafts.get(id);
  if (!draft) return false;

  draft.approved = true;
  return true;
}