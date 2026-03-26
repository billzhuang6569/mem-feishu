import type { PluginConfig } from "./config.js";
import { FeishuClient } from "./feishu-client.js";
import { ensureMemorySetup } from "./setup.js";
import type { MemoryRecallInput, MemoryRecord, MemoryStoreInput } from "./types.js";

interface AgentTableContext {
  appToken: string;
  tableId: string;
}

export class MemoryService {
  private readonly agentTables = new Map<string, AgentTableContext>();

  constructor(
    private readonly client: FeishuClient,
    private readonly config: PluginConfig
  ) {}

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
    return this.mapRecord(created.recordId, created.fields);
  }

  // TODO: M4 阶段接入 VikingDB 后，废弃全量拉取本地过滤的逻辑，改用向量检索
  async recall(agentId: string, input: MemoryRecallInput): Promise<MemoryRecord[]> {
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
