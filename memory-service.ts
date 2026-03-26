import type { PluginConfig } from "./config.js";
import type { PluginLogger } from "openclaw/plugin-sdk/plugin-entry";
import { FeishuClient } from "./feishu-client.js";
import { ensureMemorySetup } from "./setup.js";
import type { MemoryRecallInput, MemoryRecord, MemoryStoreInput } from "./types.js";
import { VIKING_VECTOR_DIMENSION, VikingDBClient } from "./vikingdb-client.js";

interface AgentTableContext {
  appToken: string;
  tableId: string;
}

export class MemoryService {
  private readonly agentTables = new Map<string, AgentTableContext>();
  private readonly vikingdb?: VikingDBClient;

  constructor(
    private readonly client: FeishuClient,
    private readonly config: PluginConfig,
    private readonly logger?: PluginLogger
  ) {
    if (this.config.vikingdb?.enabled) {
      this.vikingdb = new VikingDBClient({
        accessKeyId: this.config.vikingdb.accessKeyId ?? "",
        accessKeySecret: this.config.vikingdb.accessKeySecret ?? "",
        host: this.config.vikingdb.host ?? ""
      });
    }
  }

  async store(agentId: string, input: MemoryStoreInput): Promise<MemoryRecord> {
    const context = await this.getAgentTable(agentId);
    const now = Date.now();
    const memoryId = crypto.randomUUID();

    const fields: Record<string, unknown> = {
      memory_id: memoryId,
      content: input.content,
      category: input.category ?? "other",
      importance: input.importance ?? 0.5,
      tags: input.tags ?? [],
      source: input.source ?? "manual",
      agent_id: agentId,
      created_at: now,
      updated_at: now
    };

    if (input.expiresAt) {
      fields.expires_at = input.expiresAt;
    }

    const created = await this.client.createRecord(context.appToken, context.tableId, fields);
    const memory = this.mapRecord(created.recordId, created.fields);

    if (this.isVikingEnabled()) {
      try {
        const embedding = await this.vikingdb!.embedding([memory.content]);
        const vector = embedding[0];
        if (!Array.isArray(vector) || vector.length !== VIKING_VECTOR_DIMENSION) {
          throw new Error(`Invalid vector dimension: expected ${VIKING_VECTOR_DIMENSION}, got ${vector?.length ?? 0}`);
        }
        const vectorId = created.recordId;
        await this.vikingdb!.upsertData(this.config.vikingdb!.collectionName ?? "", [
          {
            id: vectorId,
            recordId: created.recordId,
            agentId,
            content: memory.content,
            vector
          }
        ]);
        memory.vectorId = vectorId;
        memory.updatedAt = Date.now();
        await this.client.updateRecord(context.appToken, context.tableId, created.recordId, {
          vector_id: vectorId,
          updated_at: memory.updatedAt
        });
      } catch (error) {
        this.logger?.warn?.(`[vikingdb] upsert failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return memory;
  }

  async recall(agentId: string, input: MemoryRecallInput): Promise<MemoryRecord[]> {
    const keywordFallback = await this.recallByKeyword(agentId, input);
    if (!this.isVikingEnabled() || input.query.trim().length === 0) {
      return keywordFallback;
    }

    const context = await this.getAgentTable(agentId);
    const limit = input.limit ?? 5;
    const minScore = input.minScore ?? 0.3;
    try {
      const embedding = await this.vikingdb!.embedding([input.query.trim()]);
      const vector = embedding[0];
      if (!Array.isArray(vector) || vector.length !== VIKING_VECTOR_DIMENSION) {
        throw new Error(`Invalid vector dimension: expected ${VIKING_VECTOR_DIMENSION}, got ${vector?.length ?? 0}`);
      }
      const recordIds = await this.vikingdb!.searchRecordIdsByVector({
        collectionName: this.config.vikingdb!.collectionName ?? "",
        indexName: this.config.vikingdb!.indexName ?? "",
        vector,
        agentId,
        limit: Math.max(limit * 3, 10)
      });
      if (recordIds.length === 0) {
        return keywordFallback;
      }
      const allRecords = await this.client.listRecords(context.appToken, context.tableId);
      const feishuMap = new Map(
        allRecords
          .map((record) => [record.recordId, this.mapRecord(record.recordId, record.fields)] as const)
          .filter((entry) => entry[1].agentId === agentId)
      );
      const vectorMemories = recordIds
        .map((recordId) => feishuMap.get(recordId))
        .filter((record): record is MemoryRecord => Boolean(record))
        .map((record) => ({
          record,
          score: calculateKeywordScore(record.content, input.query.trim().toLowerCase(), record.tags)
        }))
        .filter((item) => item.score >= minScore)
        .sort((a, b) => b.score - a.score || b.record.importance - a.record.importance)
        .slice(0, limit)
        .map((item) => item.record);
      return vectorMemories.length > 0 ? vectorMemories : keywordFallback;
    } catch (error) {
      this.logger?.warn?.(`[vikingdb] recall degraded to keyword: ${error instanceof Error ? error.message : String(error)}`);
      return keywordFallback;
    }
  }

  private async recallByKeyword(agentId: string, input: MemoryRecallInput): Promise<MemoryRecord[]> {
    const context = await this.getAgentTable(agentId);
    const allRecords = await this.client.listRecords(context.appToken, context.tableId);
    const query = input.query.trim().toLowerCase();
    const limit = input.limit ?? 5;
    const minScore = input.minScore ?? 0.3;

    return allRecords
      .map((record) => this.mapRecord(record.recordId, record.fields))
      .filter((record) => record.agentId === agentId)
      .map((record) => ({
        record,
        score: calculateKeywordScore(record.content, query, record.tags)
      }))
      .filter((item) => item.score >= minScore)
      .sort((a, b) => b.score - a.score || b.record.importance - a.record.importance)
      .slice(0, limit)
      .map((item) => item.record);
  }

  async forget(agentId: string, recordId: string): Promise<void> {
    const context = await this.getAgentTable(agentId);
    await this.client.deleteRecord(context.appToken, context.tableId, recordId);
  }

  private isVikingEnabled(): boolean {
    return Boolean(
      this.config.vikingdb?.enabled &&
        this.vikingdb &&
        this.config.vikingdb.collectionName &&
        this.config.vikingdb.indexName
    );
  }

  private async getAgentTable(agentId: string): Promise<AgentTableContext> {
    const cached = this.agentTables.get(agentId);
    if (cached) {
      return cached;
    }
    const setup = await ensureMemorySetup(this.client, this.config, agentId);
    const context = {
      appToken: setup.appToken,
      tableId: setup.tableId
    };
    this.agentTables.set(agentId, context);
    return context;
  }

  private mapRecord(recordId: string, fields: Record<string, unknown>): MemoryRecord {
    return {
      memoryId: getString(fields.memory_id) ?? recordId,
      content: getString(fields.content) ?? "",
      category: toCategory(getString(fields.category)),
      importance: getNumber(fields.importance) ?? 0,
      tags: toStringArray(fields.tags),
      source: toSource(getString(fields.source)),
      agentId: getString(fields.agent_id) ?? "",
      vectorId: getString(fields.vector_id),
      createdAt: getNumber(fields.created_at) ?? 0,
      updatedAt: getNumber(fields.updated_at) ?? 0,
      expiresAt: getNumber(fields.expires_at) ?? undefined
    };
  }
}

function calculateKeywordScore(content: string, query: string, tags: string[]): number {
  if (!query) {
    return 1;
  }
  const contentLower = content.toLowerCase();
  let score = 0;
  if (contentLower.includes(query)) {
    score += 0.6;
  }
  const queryTokens = query.split(/\s+/).filter(Boolean);
  if (queryTokens.length > 0) {
    const matchedTokenCount = queryTokens.filter((token) => contentLower.includes(token)).length;
    score += (matchedTokenCount / queryTokens.length) * 0.3;
  }
  const tagsLower = tags.map((tag) => tag.toLowerCase());
  if (tagsLower.some((tag) => tag.includes(query))) {
    score += 0.1;
  }
  return Math.min(1, score);
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function toCategory(value: string | undefined): MemoryRecord["category"] {
  if (value === "preference" || value === "fact" || value === "decision" || value === "entity") {
    return value;
  }
  return "other";
}

function toSource(value: string | undefined): MemoryRecord["source"] {
  if (value === "auto-capture" || value === "manual" || value === "tool-call") {
    return value;
  }
  return "manual";
}
