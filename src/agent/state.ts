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

export function listDrafts(connector?: Connector): Draft[] {
  const all = Array.from(drafts.values());
  if (!connector) return all;
  return all.filter((draft) => draft.connector === connector);
}

export function getLatestDraft(connector?: Connector): Draft | undefined {
  const matching = listDrafts(connector).filter((draft) => !draft.approved);
  return matching[matching.length - 1] ?? listDrafts(connector).pop();
}

export function approveDraft(id: string): boolean {
  const draft = drafts.get(id);
  if (!draft) return false;

  draft.approved = true;
  return true;
}