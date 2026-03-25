/**
 * FeishuMemoryBackend
 *
 * 将飞书 Bitable（主库）和本地 sqlite-vec（向量索引）封装为统一的后端接口。
 * 供 openclaw-plugin 直接 import 使用，取代旧版 CLI 子进程调用模式。
 *
 * 双写约定：每次写入/更新飞书记录后，必须同步 upsert 本地向量库，
 * 且始终以飞书 record_id 作为向量键。
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { fetch as undiciFetch, Agent, ProxyAgent } from 'undici';
import { feishuFetch, getTenantAccessToken } from '../feishu/http.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const DB_PATH = path.join(DATA_DIR, 'vectors.db');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');

const FEISHU_BASE = 'https://open.feishu.cn/open-apis';

// ── 类型定义 ────────────────────────────────────────────────────────────────

export type MemoryType = 'pinned' | 'insight';
export type MemoryState = '活跃' | '暂停' | '归档' | '已删除';

export interface Memory {
  id: string;
  content: string;
  tags: string[];
  source: string;
  state: MemoryState;
  memoryType: MemoryType;
  project?: string;
  sessionId?: string;
  supersededBy?: string;
  createdAt: number;
  updatedAt?: number;
  recordId?: string;
}

export interface MemoryInput {
  content: string;
  tags?: string[];
  source?: string;
  project?: string;
  sessionId?: string;
  memoryType?: MemoryType;
}

export interface SearchResult extends Memory {
  score: number;
}

export interface BackendConfig {
  FEISHU_APP_ID: string;
  FEISHU_APP_SECRET: string;
  FEISHU_APP_TOKEN?: string;
  GOOGLE_API_KEY: string;
  FEISHU_TABLE_NAME?: string;
}

// ── 飞书字段名常量 ───────────────────────────────────────────────────────────

const FIELD = {
  ID: '记忆ID',
  CONTENT: '内容',
  TAGS: '标签',
  SOURCE: '来源',
  STATE: '状态',
  MEMORY_TYPE: '记忆类型',
  PROJECT: '项目',
  SESSION_ID: '会话ID',
  SUPERSEDED_BY: '被替代者',
  CREATED_AT: '创建时间',
  UPDATED_AT: '更新时间',
} as const;

const FieldType = {
  TEXT: 1,
  NUMBER: 2,
  SELECT: 3,
  MULTISELECT: 4,
  DATE: 5,
};

const EMBED_MODEL = 'gemini-embedding-2-preview';
const EMBED_DIM = 768;
const GEMINI_FLASH_MODEL = 'gemini-2.0-flash';

// ── FeishuMemoryBackend ──────────────────────────────────────────────────────

export class FeishuMemoryBackend {
  private appId: string;
  private appSecret: string;
  private appToken: string;
  private tableName: string;
  private googleApiKey: string;
  private tableId: string | null = null;
  private db: Database.Database | null = null;
  private vecTableCreated = false;

  constructor(config: BackendConfig) {
    if (!config.FEISHU_APP_ID || !config.FEISHU_APP_SECRET) {
      throw new Error('[mem-feishu] 缺少 FEISHU_APP_ID 或 FEISHU_APP_SECRET');
    }
    if (!config.GOOGLE_API_KEY) {
      throw new Error('[mem-feishu] 缺少 GOOGLE_API_KEY');
    }

    this.appId = config.FEISHU_APP_ID;
    this.appSecret = config.FEISHU_APP_SECRET;

    // App Token 优先使用传入配置，其次读取本地缓存
    this.appToken = config.FEISHU_APP_TOKEN ?? this._readLocalAppToken() ?? '';
    if (!this.appToken) {
      throw new Error('[mem-feishu] 缺少 FEISHU_APP_TOKEN，请先运行 setup 命令');
    }

    this.tableName = config.FEISHU_TABLE_NAME ?? 'AI 记忆库';
    this.googleApiKey = config.GOOGLE_API_KEY;
  }

  // ── 初始化 ─────────────────────────────────────────────────────────────────

  async ensureReady(): Promise<void> {
    if (!this.tableId) {
      this.tableId = await this._ensureTable();
    }
  }

  // ── 写入（飞书 + 向量双写）────────────────────────────────────────────────

  async store(input: MemoryInput): Promise<Memory> {
    const tableId = await this._getTableId();
    const id = uuidv4();
    const now = Date.now();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fields: Record<string, any> = {
      [FIELD.ID]: id,
      [FIELD.CONTENT]: input.content,
      [FIELD.TAGS]: input.tags ?? [],
      [FIELD.SOURCE]: input.source ?? 'manual',
      [FIELD.STATE]: '活跃',
      [FIELD.MEMORY_TYPE]: input.memoryType ?? 'insight',
      [FIELD.PROJECT]: input.project ?? '',
      [FIELD.SESSION_ID]: input.sessionId ?? '',
      [FIELD.SUPERSEDED_BY]: '',
      [FIELD.CREATED_AT]: now,
      [FIELD.UPDATED_AT]: now,
    };

    const headers = await this._authHeaders();
    const res = (await feishuFetch(
      `${FEISHU_BASE}/bitable/v1/apps/${this.appToken}/tables/${tableId}/records`,
      { method: 'POST', headers, body: JSON.stringify({ fields }) }
    )) as { data: { record: { record_id: string } } };

    const recordId = res.data?.record?.record_id;
    const memory: Memory = {
      id,
      content: input.content,
      tags: input.tags ?? [],
      source: input.source ?? 'manual',
      state: '活跃',
      memoryType: input.memoryType ?? 'insight',
      project: input.project,
      sessionId: input.sessionId,
      createdAt: now,
      updatedAt: now,
      recordId,
    };

    // 双写：向量库（record_id 作为键）
    if (recordId) {
      try {
        const vec = await this._embed(input.content);
        this._upsertVector(recordId, vec);
      } catch (e) {
        console.error('[mem-feishu] 向量写入失败（不影响飞书存储）:', e);
      }
    }

    return memory;
  }

  // ── 向量语义搜索 ───────────────────────────────────────────────────────────

  async search(query: string, limit = 10): Promise<SearchResult[]> {
    const queryVec = await this._embed(query);
    const hits = this._vectorSearch(queryVec, limit);
    if (hits.length === 0) return [];

    const maxDist = Math.max(...hits.map((h) => h.distance), 1);
    const idToScore = new Map(hits.map((h) => [h.id, 1 - h.distance / maxDist]));

    const records = await this.getByIds(hits.map((h) => h.id));
    return records
      .filter((r) => r.state === '活跃')
      .map((r) => ({ ...r, score: idToScore.get(r.recordId ?? '') ?? 0 }))
      .sort((a, b) => b.score - a.score);
  }

  // ── 飞书关键词搜索（用于 RRF 混合检索的关键词路径）────────────────────────

  async kwSearch(query: string, limit = 10): Promise<Memory[]> {
    const tableId = await this._getTableId();
    try {
      const headers = await this._authHeaders();
      const res = (await feishuFetch(
        `${FEISHU_BASE}/bitable/v1/apps/${this.appToken}/tables/${tableId}/records/search?page_size=${limit}`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            filter: {
              conjunction: 'and',
              conditions: [
                { field_name: FIELD.STATE, operator: 'is', value: ['活跃'] },
                { field_name: FIELD.CONTENT, operator: 'contains', value: [query] },
              ],
            },
            sort: [{ field_name: FIELD.CREATED_AT, desc: true }],
          }),
        }
      )) as { data: { items: Array<{ record_id: string; fields: Record<string, unknown> }> } };

      return (res.data?.items ?? []).map((item) =>
        this._parseFields(item.fields ?? {}, item.record_id)
      );
    } catch {
      return [];
    }
  }

  // ── 混合搜索（向量 + 关键词，RRF 融合）────────────────────────────────────

  async hybridSearch(query: string, limit = 10): Promise<SearchResult[]> {
    const [vecResults, kwResults] = await Promise.allSettled([
      this.search(query, limit),
      this.kwSearch(query, limit),
    ]);

    const vec = vecResults.status === 'fulfilled' ? vecResults.value : [];
    const kw = kwResults.status === 'fulfilled' ? kwResults.value : [];

    if (vec.length === 0 && kw.length === 0) return [];

    // RRF 融合
    const RRF_K = 60.0;
    const scores = new Map<string, number>();

    kw.forEach((m, rank) => {
      const key = m.recordId ?? m.id;
      scores.set(key, (scores.get(key) ?? 0) + 1.0 / (RRF_K + rank + 1));
    });
    vec.forEach((m, rank) => {
      const key = m.recordId ?? m.id;
      scores.set(key, (scores.get(key) ?? 0) + 1.0 / (RRF_K + rank + 1));
    });

    const allById = new Map<string, SearchResult>();
    for (const m of vec) {
      allById.set(m.recordId ?? m.id, m);
    }
    for (const m of kw) {
      const key = m.recordId ?? m.id;
      if (!allById.has(key)) {
        allById.set(key, { ...m, score: 0 });
      }
    }

    // 按 RRF score 排序，pinned 类型 1.5 倍加权
    return Array.from(allById.values())
      .map((m) => {
        const key = m.recordId ?? m.id;
        let s = scores.get(key) ?? 0;
        if (m.memoryType === 'pinned') s *= 1.5;
        return { ...m, score: s };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  // ── 按 record_id 批量获取（batch_get）────────────────────────────────────

  async getByIds(recordIds: string[]): Promise<Memory[]> {
    if (recordIds.length === 0) return [];
    const tableId = await this._getTableId();
    const headers = await this._authHeaders();

    try {
      const res = (await feishuFetch(
        `${FEISHU_BASE}/bitable/v1/apps/${this.appToken}/tables/${tableId}/records/batch_get`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ record_ids: recordIds }),
        }
      )) as { data: { records: Array<{ record_id: string; fields: Record<string, unknown> }> } };

      return (res.data?.records ?? []).map((r) => this._parseFields(r.fields ?? {}, r.record_id));
    } catch {
      return [];
    }
  }

  // ── 更新记录（飞书 + 向量双写）────────────────────────────────────────────

  async update(
    recordId: string,
    patch: Partial<{ state: MemoryState; tags: string[]; memoryType: MemoryType; supersededBy: string; content: string }>
  ): Promise<void> {
    const tableId = await this._getTableId();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fields: Record<string, any> = { [FIELD.UPDATED_AT]: Date.now() };
    if (patch.state !== undefined) fields[FIELD.STATE] = patch.state;
    if (patch.tags !== undefined) fields[FIELD.TAGS] = patch.tags;
    if (patch.memoryType !== undefined) fields[FIELD.MEMORY_TYPE] = patch.memoryType;
    if (patch.supersededBy !== undefined) fields[FIELD.SUPERSEDED_BY] = patch.supersededBy;
    if (patch.content !== undefined) fields[FIELD.CONTENT] = patch.content;

    const headers = await this._authHeaders();
    await feishuFetch(
      `${FEISHU_BASE}/bitable/v1/apps/${this.appToken}/tables/${tableId}/records/${recordId}`,
      { method: 'PUT', headers, body: JSON.stringify({ fields }) }
    );

    // 如果内容更新了，重新向量化
    if (patch.content) {
      try {
        const vec = await this._embed(patch.content);
        this._upsertVector(recordId, vec);
      } catch (e) {
        console.error('[mem-feishu] 向量更新失败:', e);
      }
    }
  }

  // ── 软删除 ────────────────────────────────────────────────────────────────

  async remove(recordId: string): Promise<void> {
    await this.update(recordId, { state: '已删除' });
    this._deleteVector(recordId);
  }

  // ── 最近记忆 ─────────────────────────────────────────────────────────────

  async listRecent(limit = 20): Promise<Memory[]> {
    const tableId = await this._getTableId();
    const allMemories: Memory[] = [];
    let pageToken: string | undefined = undefined;
    let hasMore = true;

    while (hasMore && allMemories.length < limit) {
      const pageSize = Math.min(limit - allMemories.length, 500);
      const urlParams = new URLSearchParams({ page_size: String(pageSize) });
      if (pageToken) urlParams.set('page_token', pageToken);

      const headers = await this._authHeaders();
      const res = (await feishuFetch(
        `${FEISHU_BASE}/bitable/v1/apps/${this.appToken}/tables/${tableId}/records/search?${urlParams}`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            sort: [{ field_name: FIELD.CREATED_AT, desc: true }],
            filter: {
              conjunction: 'and',
              conditions: [{ field_name: FIELD.STATE, operator: 'is', value: ['活跃'] }],
            },
          }),
        }
      )) as {
        data: {
          items: Array<{ record_id: string; fields: Record<string, unknown> }>;
          has_more: boolean;
          page_token: string;
        };
      };

      for (const item of res.data?.items ?? []) {
        allMemories.push(this._parseFields(item.fields ?? {}, item.record_id));
      }

      hasMore = res.data?.has_more ?? false;
      pageToken = res.data?.page_token ?? undefined;
    }

    return allMemories;
  }

  // ── Gemini 事实提取（两阶段管线 Phase 1）────────────────────────────────────

  async extractFacts(messages: Array<{ role: string; content: string }>): Promise<string[]> {
    const systemPrompt = `You are an information extraction engine. Your task is to identify distinct, atomic facts from a conversation.

## Rules

1. Extract facts ONLY from the user's messages. Ignore assistant and system messages entirely.
2. Each fact must be a single, self-contained statement (one idea per fact).
3. Prefer specific details over vague summaries.
   - Good: "Uses Go 1.22 for backend services"
   - Bad: "Knows some programming languages"
4. Preserve the user's original language. If the user writes in Chinese, extract facts in Chinese.
5. Omit ephemeral information (greetings, filler, debugging chatter with no lasting value).
6. Omit information that is only relevant to the current task and has no future reuse value.
7. If no meaningful facts exist in the conversation, return an empty facts array.

## Output Format

Return ONLY valid JSON. No markdown fences, no explanation.

{"facts": ["fact one", "fact two", ...]}`;

    const conversation = messages
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n\n');

    try {
      const result = await this._callGeminiChat(systemPrompt, conversation);
      const parsed = JSON.parse(result) as { facts: string[] };
      return Array.isArray(parsed.facts) ? parsed.facts : [];
    } catch {
      return [];
    }
  }

  // ── 记忆对账（两阶段管线 Phase 2）────────────────────────────────────────

  async reconcile(
    facts: string[],
    sessionId: string,
    agentId: string,
    project?: string
  ): Promise<void> {
    for (const fact of facts) {
      const related = await this.hybridSearch(fact, 5);
      const activeRelated = related.filter((m) => m.state === '活跃');

      if (activeRelated.length === 0) {
        await this.store({
          content: fact,
          tags: ['自动'],
          source: agentId,
          project,
          sessionId,
          memoryType: 'insight',
        });
        continue;
      }

      const decision = await this._reconcileWithLLM(fact, activeRelated);
      await this._applyReconciliation(decision, fact, sessionId, agentId, project, activeRelated);
    }
  }

  // ── 私有：对账 LLM 调用 ───────────────────────────────────────────────────

  private async _reconcileWithLLM(
    newFact: string,
    existing: Memory[]
  ): Promise<{ id: string; text: string; event: 'ADD' | 'UPDATE' | 'DELETE' | 'NOOP'; old_memory?: string }[]> {
    const systemPrompt = `You are a memory management engine. You manage a knowledge base by comparing newly extracted facts against existing memories and deciding the correct action.

## Actions

- ADD: The fact is new information not present in any existing memory.
- UPDATE: The fact refines, corrects, or adds detail to an existing memory.
- DELETE: The fact directly contradicts an existing memory, making it obsolete.
- NOOP: The fact is already captured by an existing memory. No action needed.

## Rules

1. Reference existing memories by their integer ID ONLY (0, 1, 2...).
2. For UPDATE, always include the original text in "old_memory".
3. When the fact means the same thing as an existing memory, use NOOP.
4. Preserve the language of the original facts. Do not translate.
5. Each existing memory has an "age" field. Use age as a tiebreaker: older memories are more likely outdated when content conflicts.

## Output Format

Return ONLY valid JSON.

{"memory": [{"id": "0", "text": "...", "event": "NOOP"}, {"id": "new", "text": "brand new fact", "event": "ADD"}]}`;

    const age = (m: Memory) => {
      const diff = Date.now() - m.createdAt;
      const days = Math.floor(diff / 86400000);
      return days > 0 ? `${days}天前` : '今天';
    };

    const existingStr = existing
      .map((m, i) => `[${i}] (age: ${age(m)}) ${m.content}`)
      .join('\n');

    const userMsg = `New fact: ${newFact}\n\nExisting memories:\n${existingStr}`;

    try {
      const result = await this._callGeminiChat(systemPrompt, userMsg);
      const parsed = JSON.parse(result) as {
        memory: { id: string; text: string; event: string; old_memory?: string }[];
      };
      return (parsed.memory ?? []) as { id: string; text: string; event: 'ADD' | 'UPDATE' | 'DELETE' | 'NOOP'; old_memory?: string }[];
    } catch {
      return [{ id: 'new', text: newFact, event: 'ADD' }];
    }
  }

  // ── 私有：执行对账操作 ────────────────────────────────────────────────────

  private async _applyReconciliation(
    decisions: { id: string; text: string; event: 'ADD' | 'UPDATE' | 'DELETE' | 'NOOP'; old_memory?: string }[],
    originalFact: string,
    sessionId: string,
    agentId: string,
    project?: string,
    existing?: Memory[]
  ): Promise<void> {
    for (const decision of decisions) {
      if (decision.event === 'NOOP') continue;

      if (decision.event === 'ADD' || decision.id === 'new') {
        await this.store({
          content: decision.text || originalFact,
          tags: ['自动'],
          source: agentId,
          project,
          sessionId,
          memoryType: 'insight',
        });
        continue;
      }

      const idx = parseInt(decision.id);
      if (isNaN(idx) || !existing?.[idx]) continue;
      const target = existing[idx];

      // pinned 类型保护：不允许自动 UPDATE/DELETE
      if (target.memoryType === 'pinned') {
        if (decision.event === 'UPDATE' || decision.event === 'DELETE') {
          await this.store({
            content: decision.text || originalFact,
            tags: ['自动'],
            source: agentId,
            project,
            sessionId,
            memoryType: 'insight',
          });
        }
        continue;
      }

      if (decision.event === 'UPDATE' && target.recordId) {
        const newMem = await this.store({
          content: decision.text,
          tags: ['自动'],
          source: agentId,
          project,
          sessionId,
          memoryType: 'insight',
        });
        await this.update(target.recordId, {
          state: '归档',
          supersededBy: newMem.recordId,
        });
      } else if (decision.event === 'DELETE' && target.recordId) {
        await this.remove(target.recordId);
      }
    }
  }

  // ── 私有：Gemini Chat API ─────────────────────────────────────────────────

  private async _callGeminiChat(systemInstruction: string, userMessage: string): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_FLASH_MODEL}:generateContent?key=${this.googleApiKey}`;

    const dispatcher = this._makeGoogleDispatcher();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (undiciFetch as any)(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        generationConfig: { temperature: 0 },
      }),
      ...(dispatcher ? { dispatcher } : {}),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Gemini API 错误 ${res.status}: ${body}`);
    }

    const data = await res.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  }

  // ── 私有：Embedding ───────────────────────────────────────────────────────

  private async _embed(text: string): Promise<Float32Array> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${this.googleApiKey}`;
    const dispatcher = this._makeGoogleDispatcher();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (undiciFetch as any)(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        outputDimensionality: EMBED_DIM,
      }),
      ...(dispatcher ? { dispatcher } : {}),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Google Embedding API 错误 ${res.status}: ${body}`);
    }

    const data = await res.json() as { embedding: { values: number[] } };
    return new Float32Array(data.embedding.values);
  }

  // ── 私有：SQLite 向量库 ──────────────────────────────────────────────────

  private _getDb(): Database.Database {
    if (!this.db) {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      this.db = new Database(DB_PATH);
      sqliteVec.load(this.db);
    }
    return this.db;
  }

  private _upsertVector(id: string, embedding: Float32Array): void {
    const db = this._getDb();
    if (!this.vecTableCreated) {
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS vectors USING vec0(
          id TEXT PRIMARY KEY,
          embedding FLOAT[${EMBED_DIM}]
        );
      `);
      this.vecTableCreated = true;
    }
    try {
      db.prepare(`INSERT OR REPLACE INTO vectors(id, embedding) VALUES (?, ?)`).run(id, embedding);
    } catch (e: unknown) {
      if (e instanceof Error && e.message?.includes('Dimension mismatch')) {
        console.warn('[mem-feishu] 向量维度不匹配，正在重建本地向量库...');
        db.exec(`DROP TABLE IF EXISTS vectors;`);
        this.vecTableCreated = false;
        this._upsertVector(id, embedding);
      } else {
        throw e;
      }
    }
  }

  private _vectorSearch(query: Float32Array, limit: number): Array<{ id: string; distance: number }> {
    const db = this._getDb();
    if (!this.vecTableCreated) {
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS vectors USING vec0(
          id TEXT PRIMARY KEY,
          embedding FLOAT[${EMBED_DIM}]
        );
      `);
      this.vecTableCreated = true;
    }
    try {
      return db
        .prepare(`SELECT id, distance FROM vectors WHERE embedding MATCH ? AND k = ? ORDER BY distance`)
        .all(query, limit) as Array<{ id: string; distance: number }>;
    } catch {
      return [];
    }
  }

  private _deleteVector(id: string): void {
    try {
      const db = this._getDb();
      db.prepare(`DELETE FROM vectors WHERE id = ?`).run(id);
    } catch { /* ignore */ }
  }

  // ── 私有：飞书表结构确保 ──────────────────────────────────────────────────

  private async _ensureTable(): Promise<string> {
    const headers = await this._authHeaders();

    const listRes = (await feishuFetch(
      `${FEISHU_BASE}/bitable/v1/apps/${this.appToken}/tables`,
      { headers }
    )) as { data: { items: Array<{ table_id: string; name: string }> } };

    const tables = listRes.data?.items ?? [];
    const existing = tables.find((t) => t.name === this.tableName);

    if (existing?.table_id) {
      await this._ensureNewFields(existing.table_id);
      return existing.table_id;
    }

    // 创建新表
    const createRes = (await feishuFetch(
      `${FEISHU_BASE}/bitable/v1/apps/${this.appToken}/tables`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ table: { name: this.tableName } }),
      }
    )) as { data: { table_id: string } };

    const tableId = createRes.data?.table_id;
    if (!tableId) throw new Error('[mem-feishu] 创建多维表格失败');

    // 重命名默认字段为"记忆ID"
    const fieldsRes = (await feishuFetch(
      `${FEISHU_BASE}/bitable/v1/apps/${this.appToken}/tables/${tableId}/fields`,
      { headers }
    )) as { data: { items: Array<{ field_id: string; field_name: string }> } };

    const defaultField = fieldsRes.data?.items?.[0];
    if (defaultField?.field_id) {
      await feishuFetch(
        `${FEISHU_BASE}/bitable/v1/apps/${this.appToken}/tables/${tableId}/fields/${defaultField.field_id}`,
        {
          method: 'PUT',
          headers,
          body: JSON.stringify({ field_name: FIELD.ID, type: FieldType.TEXT }),
        }
      );
    }

    // 创建所有字段
    const fieldsToCreate = [
      { field_name: FIELD.CONTENT, type: FieldType.TEXT },
      { field_name: FIELD.TAGS, type: FieldType.MULTISELECT },
      { field_name: FIELD.SOURCE, type: FieldType.SELECT },
      { field_name: FIELD.STATE, type: FieldType.SELECT },
      { field_name: FIELD.MEMORY_TYPE, type: FieldType.SELECT },
      { field_name: FIELD.PROJECT, type: FieldType.TEXT },
      { field_name: FIELD.SESSION_ID, type: FieldType.TEXT },
      { field_name: FIELD.SUPERSEDED_BY, type: FieldType.TEXT },
      { field_name: FIELD.CREATED_AT, type: FieldType.DATE },
      { field_name: FIELD.UPDATED_AT, type: FieldType.DATE },
    ];

    for (const field of fieldsToCreate) {
      await feishuFetch(
        `${FEISHU_BASE}/bitable/v1/apps/${this.appToken}/tables/${tableId}/fields`,
        { method: 'POST', headers, body: JSON.stringify(field) }
      );
    }

    return tableId;
  }

  private async _ensureNewFields(tableId: string): Promise<void> {
    const headers = await this._authHeaders();
    const fieldsRes = (await feishuFetch(
      `${FEISHU_BASE}/bitable/v1/apps/${this.appToken}/tables/${tableId}/fields`,
      { headers }
    )) as { data: { items: Array<{ field_name: string }> } };

    const existingNames = new Set((fieldsRes.data?.items ?? []).map((f) => f.field_name ?? ''));

    const newFields = [
      { field_name: FIELD.MEMORY_TYPE, type: FieldType.SELECT },
      { field_name: FIELD.SESSION_ID, type: FieldType.TEXT },
      { field_name: FIELD.SUPERSEDED_BY, type: FieldType.TEXT },
      { field_name: FIELD.UPDATED_AT, type: FieldType.DATE },
    ];

    for (const field of newFields) {
      if (!existingNames.has(field.field_name)) {
        try {
          await feishuFetch(
            `${FEISHU_BASE}/bitable/v1/apps/${this.appToken}/tables/${tableId}/fields`,
            { method: 'POST', headers, body: JSON.stringify(field) }
          );
        } catch { /* 忽略已存在的情况 */ }
      }
    }
  }

  private async _getTableId(): Promise<string> {
    if (!this.tableId) {
      this.tableId = await this._ensureTable();
    }
    return this.tableId;
  }

  // ── 私有：获取带 Authorization 的请求头 ──────────────────────────────────

  private async _authHeaders(): Promise<Record<string, string>> {
    const token = await getTenantAccessToken(this.appId, this.appSecret);
    return { Authorization: `Bearer ${token}` };
  }

  // ── 私有：字段解析 ────────────────────────────────────────────────────────

  private _parseFields(fields: Record<string, unknown>, recordId?: string): Memory {
    const getText = (raw: unknown): string => {
      if (Array.isArray(raw)) {
        return raw.map((c) =>
          typeof c === 'object' && c !== null && 'text' in c ? String((c as { text: unknown }).text) : String(c)
        ).join('');
      }
      if (typeof raw === 'object' && raw !== null && 'text' in raw) {
        return String((raw as { text: unknown }).text);
      }
      return String(raw ?? '');
    };

    const tagsRaw = fields[FIELD.TAGS];
    const tags: string[] = Array.isArray(tagsRaw)
      ? tagsRaw.map((t) => (typeof t === 'object' && t !== null && 'text' in t ? String((t as { text: unknown }).text) : String(t)))
      : [];

    const stateRaw = fields[FIELD.STATE];
    const state = (typeof stateRaw === 'object' && stateRaw !== null && 'text' in stateRaw
      ? String((stateRaw as { text: unknown }).text)
      : String(stateRaw ?? '活跃')) as MemoryState;

    const sourceRaw = fields[FIELD.SOURCE];
    const source = typeof sourceRaw === 'object' && sourceRaw !== null && 'text' in sourceRaw
      ? String((sourceRaw as { text: unknown }).text)
      : String(sourceRaw ?? 'manual');

    const memTypeRaw = fields[FIELD.MEMORY_TYPE];
    const memTypeStr = typeof memTypeRaw === 'object' && memTypeRaw !== null && 'text' in memTypeRaw
      ? String((memTypeRaw as { text: unknown }).text)
      : String(memTypeRaw ?? '');
    const memoryType: MemoryType = memTypeStr === 'insight' ? 'insight' : 'pinned';

    return {
      id: getText(fields[FIELD.ID]) || recordId || '',
      content: getText(fields[FIELD.CONTENT]),
      tags,
      source,
      state,
      memoryType,
      project: getText(fields[FIELD.PROJECT]) || undefined,
      sessionId: getText(fields[FIELD.SESSION_ID]) || undefined,
      supersededBy: getText(fields[FIELD.SUPERSEDED_BY]) || undefined,
      createdAt: typeof fields[FIELD.CREATED_AT] === 'number' ? (fields[FIELD.CREATED_AT] as number) : Date.now(),
      updatedAt: typeof fields[FIELD.UPDATED_AT] === 'number' ? (fields[FIELD.UPDATED_AT] as number) : undefined,
      recordId,
    };
  }

  // ── 私有：读取本地缓存的 App Token ────────────────────────────────────────

  private _readLocalAppToken(): string | undefined {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as { appToken?: string };
        return cfg.appToken;
      }
    } catch { /* ignore */ }
    return undefined;
  }

  // ── 私有：Google API 代理（飞书直连，Google 可走代理）────────────────────

  private _makeGoogleDispatcher() {
    const proxy = process.env.https_proxy ?? process.env.HTTPS_PROXY
      ?? process.env.http_proxy ?? process.env.HTTP_PROXY;
    if (proxy) return new ProxyAgent(proxy);
    return undefined;
  }
}
