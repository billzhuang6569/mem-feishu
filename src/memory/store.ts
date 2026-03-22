import { addRecord, ensureTable } from '../feishu/bitable.js';
import { upsertVector } from '../vector/db.js';
import { embed } from '../vector/embed.js';
import type { Memory, MemoryInput } from '../feishu/types.js';

let _tableId: string | null = null;

export async function getTableId(): Promise<string> {
  if (!_tableId) {
    _tableId = await ensureTable();
  }
  return _tableId;
}

export async function saveMemory(input: MemoryInput): Promise<Memory> {
  const tableId = await getTableId();
  const memory = await addRecord(tableId, input);
  // 同步写入向量库
  const vec = await embed(memory.content);
  upsertVector(memory.id, vec);
  return memory;
}
