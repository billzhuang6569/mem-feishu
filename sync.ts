import type { PluginLogger } from "openclaw/plugin-sdk/plugin-entry";
import type { PluginConfig } from "./config.js";
import { FeishuClient } from "./feishu-client.js";
import { extractAppToken } from "./setup.js";

interface RecordDigest {
  updatedAt: number;
  contentHash: string;
}

interface TableSnapshot {
  tableName: string;
  records: Map<string, RecordDigest>;
}

export interface SyncDiff {
  tableName: string;
  added: string[];
  updated: string[];
  deleted: string[];
}

export interface SyncRunResult {
  startedAt: number;
  finishedAt: number;
  scannedTables: number;
  diffs: SyncDiff[];
}

export class MemorySyncManager {
  private readonly snapshots = new Map<string, TableSnapshot>();

  constructor(
    private readonly client: FeishuClient,
    private readonly config: PluginConfig,
    private readonly logger: PluginLogger
  ) {}

  async runOnce(): Promise<SyncRunResult> {
    const startedAt = Date.now();
    const appToken = resolveAppToken(this.config);
    if (!appToken) {
      this.logger.warn("[sync] skipped: missing feishu.appToken");
      return {
        startedAt,
        finishedAt: Date.now(),
        scannedTables: 0,
        diffs: []
      };
    }

    const tables = await this.client.listTables(appToken);
    const memoryTables = tables.filter((table) => table.name.startsWith("Table-"));
    const diffs: SyncDiff[] = [];

    for (const table of memoryTables) {
      const records = await this.client.listRecords(appToken, table.tableId);
      const current = new Map<string, RecordDigest>();
      for (const record of records) {
        const updatedAt = toNumber(record.fields.updated_at) ?? 0;
        const content = toString(record.fields.content) ?? "";
        current.set(record.recordId, {
          updatedAt,
          contentHash: hashText(content)
        });
      }

      const previous = this.snapshots.get(table.tableId);
      const diff = diffTableSnapshot(table.name, previous?.records, current);
      if (diff.added.length > 0 || diff.updated.length > 0 || diff.deleted.length > 0) {
        diffs.push(diff);
      }

      this.snapshots.set(table.tableId, {
        tableName: table.name,
        records: current
      });
    }

    for (const [tableId, snapshot] of [...this.snapshots.entries()]) {
      const exists = memoryTables.some((table) => table.tableId === tableId);
      if (!exists) {
        diffs.push({
          tableName: snapshot.tableName,
          added: [],
          updated: [],
          deleted: [...snapshot.records.keys()]
        });
        this.snapshots.delete(tableId);
      }
    }

    return {
      startedAt,
      finishedAt: Date.now(),
      scannedTables: memoryTables.length,
      diffs
    };
  }
}

function diffTableSnapshot(
  tableName: string,
  previous: Map<string, RecordDigest> | undefined,
  current: Map<string, RecordDigest>
): SyncDiff {
  if (!previous) {
    return {
      tableName,
      added: [...current.keys()],
      updated: [],
      deleted: []
    };
  }

  const added: string[] = [];
  const updated: string[] = [];
  const deleted: string[] = [];

  for (const [recordId, digest] of current.entries()) {
    const oldDigest = previous.get(recordId);
    if (!oldDigest) {
      added.push(recordId);
      continue;
    }
    if (oldDigest.updatedAt !== digest.updatedAt || oldDigest.contentHash !== digest.contentHash) {
      updated.push(recordId);
    }
  }

  for (const recordId of previous.keys()) {
    if (!current.has(recordId)) {
      deleted.push(recordId);
    }
  }

  return {
    tableName,
    added,
    updated,
    deleted
  };
}

function resolveAppToken(config: PluginConfig): string | undefined {
  const raw = config.feishu.appToken?.trim();
  if (!raw) {
    return undefined;
  }
  return extractAppToken(raw) ?? raw;
}

function toNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function toString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function hashText(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return String(hash);
}
