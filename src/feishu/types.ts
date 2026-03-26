export type MemoryType = 'pinned' | 'insight';
export type MemoryState = '活跃' | '暂停' | '归档' | '已删除';

export interface Memory {
  id: string;             // 记忆ID（UUID）
  content: string;        // 内容
  tags: string[];         // 标签
  source: string;         // 来源
  state: MemoryState;     // 状态
  memoryType: MemoryType; // 记忆类型（v2.0）：pinned=用户偏好，insight=自动洞察；老数据默认 pinned
  project?: string;       // 项目
  sessionId?: string;     // 会话ID（v2.0）
  supersededBy?: string;  // 被替代者 record_id（v2.0 UPDATE 时使用）
  createdAt: number;      // 创建时间（unix ms）
  updatedAt?: number;     // 更新时间（v2.0）
  recordId?: string;      // 飞书 Bitable 的 record_id（内部用）
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

// 飞书多维表格字段名映射（用于读写）
export const FIELD = {
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

export const TABLE_NAME = process.env.FEISHU_TABLE_NAME ?? 'AI 记忆库';
