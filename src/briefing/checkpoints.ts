import type { Database } from "better-sqlite3";
import type {
  Checkpoint,
  CheckpointStore,
  SourceKind,
} from "./types";

interface CheckpointRow {
  last_item_id: string;
  last_item_time: string;
  updated_at: string;
}

export function createSqliteCheckpointStore(db: Database): CheckpointStore {
  db.exec(`
    CREATE TABLE IF NOT EXISTS briefing_checkpoints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL,
      source_kind TEXT NOT NULL,
      source_key TEXT NOT NULL,
      last_item_id TEXT NOT NULL,
      last_item_time TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (tenant_id, source_kind, source_key)
    );
  `);

  const getStatement = db.prepare(`
    SELECT last_item_id, last_item_time, updated_at
    FROM briefing_checkpoints
    WHERE tenant_id = ?
      AND source_kind = ?
      AND source_key = ?
    LIMIT 1;
  `);

  const upsertStatement = db.prepare(`
    INSERT INTO briefing_checkpoints (
      tenant_id,
      source_kind,
      source_key,
      last_item_id,
      last_item_time,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(tenant_id, source_kind, source_key)
    DO UPDATE SET
      last_item_id = excluded.last_item_id,
      last_item_time = excluded.last_item_time,
      updated_at = excluded.updated_at;
  `);

  return {
    get({ tenantId, sourceKind, sourceKey }) {
      const row = getStatement.get(
        tenantId,
        sourceKind,
        sourceKey,
      ) as CheckpointRow | undefined;

      if (!row) return Promise.resolve(null);

      return Promise.resolve({
        lastItemId: row.last_item_id,
        lastItemTime: row.last_item_time,
        updatedAt: row.updated_at,
      });
    },

    save({ tenantId, sourceKind, sourceKey, checkpoint }) {
      upsertStatement.run(
        tenantId,
        sourceKind,
        sourceKey,
        checkpoint.lastItemId,
        checkpoint.lastItemTime,
        checkpoint.updatedAt,
      );

      return Promise.resolve();
    },
  };
}

export function checkpointKeyForSlackChannel(channelId: string): string {
  return `slack:${channelId}`;
}