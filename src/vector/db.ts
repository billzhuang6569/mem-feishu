import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '../../data/vectors.db');

let _db: Database.Database | null = null;
let _isTableCreated = false;

function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    sqliteVec.load(_db);
  }
  return _db;
}

// 插入或替换向量（动态建表，维度由第一次插入的向量决定）
export function upsertVector(id: string, embedding: Float32Array): void {
  const db = getDb();

  if (!_isTableCreated) {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vectors USING vec0(
        id TEXT PRIMARY KEY,
        embedding FLOAT[${embedding.length}]
      );
    `);
    _isTableCreated = true;
  }

  try {
    db.prepare(`INSERT OR REPLACE INTO vectors(id, embedding) VALUES (?, ?)`).run(id, embedding);
  } catch (e: any) {
    if (e.message?.includes('Dimension mismatch')) {
      console.warn('[mem-feishu] 向量维度不匹配，正在重建本地向量库...');
      db.exec(`DROP TABLE IF EXISTS vectors;`);
      _isTableCreated = false;
      upsertVector(id, embedding);
    } else {
      throw e;
    }
  }
}

// 向量相似搜索，返回 {id, distance}[]
export function vectorSearch(
  query: Float32Array,
  limit: number
): Array<{ id: string; distance: number }> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, distance FROM vectors WHERE embedding MATCH ? AND k = ? ORDER BY distance`
    )
    .all(query, limit) as Array<{ id: string; distance: number }>;
  return rows;
}

// 删除向量
export function deleteVector(id: string): void {
  const db = getDb();
  db.prepare(`DELETE FROM vectors WHERE id = ?`).run(id);
}
