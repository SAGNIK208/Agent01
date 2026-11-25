export type SourceKind = "mail" | "chat" | "calendar";

export interface BriefingWindow {
  timeZone: string;
  from: string;
  now: string;
}

export interface SourceTarget {
  provider: string;
  connectionId: string;
  itemId: string;
  containerId?: string;
  sender?: string;
  authorId?: string;
}

export interface SourceItem {
  title: string;
  excerpt: string;
  occurredAt: string;
  target: SourceTarget;
}

export interface SourceBatch {
  items: SourceItem[];
  skipped: number;
  truncated: boolean;
}

export interface BriefingSource {
  id: string;
  label: string;
  kind: SourceKind;
  collect(window: BriefingWindow): Promise<SourceBatch>;
}

export interface ModelItem {
  ref: string;
  kind: SourceKind;
  title: string;
  excerpt: string;
  occurredAt: string;
}

export interface Checkpoint {
  lastItemId: string;
  lastItemTime: string;
  updatedAt: string;
}

export interface CheckpointStore {
  get(input: {
    tenantId: string;
    sourceKind: SourceKind;
    sourceKey: string;
  }): Promise<Checkpoint | null>;

  save(input: {
    tenantId: string;
    sourceKind: SourceKind;
    sourceKey: string;
    checkpoint: Checkpoint;
  }): Promise<void>;
}