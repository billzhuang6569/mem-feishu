import { listRecent } from '../feishu/bitable.js';
import type { Memory } from '../feishu/types.js';
import { getTableId } from './store.js';

export async function getRecentMemories(limit = 20): Promise<Memory[]> {
  const tableId = await getTableId();
  return listRecent(tableId, limit);
}
