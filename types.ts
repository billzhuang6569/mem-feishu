export type MemoryCategory = "preference" | "fact" | "decision" | "entity" | "other";

export type MemorySource = "auto-capture" | "manual" | "tool-call";

export interface MemoryRecord {
  memoryId: string;
  content: string;
  category: MemoryCategory;
  importance: number;
  tags: string[];
  source: MemorySource;
  agentId: string;
  vectorId?: string;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
}

export interface MemoryStoreInput {
  content: string;
  category?: MemoryCategory;
  importance?: number;
  tags?: string[];
  source?: MemorySource;
  expiresAt?: number;
}

export interface MemoryRecallInput {
  query: string;
  limit?: number;
  minScore?: number;
}
