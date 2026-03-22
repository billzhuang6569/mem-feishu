import Database from 'better-sqlite3';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '../../data/vectors.db');

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    // 加载 sqlite-vec 扩展
    const require = createRequire(import.meta.url);
    const sqliteVec = require('sqlite-vec');
    sqliteVec.load(_db);
    // 建表
    _db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vectors USING vec0(
        id TEXT PRIMARY KEY,
        embedding FLOAT[384]
      );
    `);
  }
  return _db;
}

// 插入或替换向量
export function upsertVector(id: string, embedding: Float32Array): void {
  const db = getDb();
  db.prepare(`INSERT OR REPLACE INTO vectors(id, embedding) VALUES (?, ?)`).run(id, embedding);
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
