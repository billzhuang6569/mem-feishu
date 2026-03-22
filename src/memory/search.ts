import { getRecordsByIds } from '../feishu/bitable.js';
import { vectorSearch } from '../vector/db.js';
import { embed } from '../vector/embed.js';
import type { SearchResult } from '../feishu/types.js';
import { getTableId } from './store.js';

export async function searchMemories(query: string, limit = 10): Promise<SearchResult[]> {
  const tableId = await getTableId();
  const queryVec = await embed(query);
  const hits = vectorSearch(queryVec, limit);

  if (hits.length === 0) return [];

  // distance 越小越相似，转换为 score（0~1，越高越好）
  const maxDist = Math.max(...hits.map((h) => h.distance), 1);
  const idToScore = new Map(hits.map((h) => [h.id, 1 - h.distance / maxDist]));

  const records = await getRecordsByIds(tableId, hits.map((h) => h.id));
  return records
    .filter((r) => r.state === '活跃')
    .map((r) => ({ ...r, score: idToScore.get(r.id) ?? 0 }))
    .sort((a, b) => b.score - a.score);
}
