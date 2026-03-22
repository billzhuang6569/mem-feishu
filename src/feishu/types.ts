export interface Memory {
  id: string;           // 记忆ID（UUID）
  content: string;      // 内容
  tags: string[];       // 标签
  source: string;       // 来源
  state: MemoryState;   // 状态
  project?: string;     // 项目
  createdAt: number;    // 创建时间（unix ms）
  recordId?: string;    // 飞书 Bitable 的 record_id（内部用）
}

export type MemoryState = '活跃' | '暂停' | '归档' | '已删除';

export interface MemoryInput {
  content: string;
  tags?: string[];
  source?: string;
  project?: string;
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
  PROJECT: '项目',
  CREATED_AT: '创建时间',
} as const;

export const TABLE_NAME = process.env.FEISHU_TABLE_NAME ?? 'AI 记忆库';
