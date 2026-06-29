import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

// مكان قاعدة البيانات: مجلد data في جذر المشروع
const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const DB_PATH = path.join(DATA_DIR, "laws.db");

// نُبقي اتصالاً واحداً مشتركاً (singleton) لتجنّب فتح القاعدة عدة مرات أثناء التطوير
let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // جدول القوانين
  db.exec(`
    CREATE TABLE IF NOT EXISTS laws (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT NOT NULL,
      law_number  TEXT,
      year        TEXT,
      category    TEXT,
      source_file TEXT,
      notes       TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // جدول المواد
  db.exec(`
    CREATE TABLE IF NOT EXISTS articles (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      law_id         INTEGER NOT NULL,
      article_number TEXT,
      heading        TEXT,
      content        TEXT NOT NULL,
      ordering       INTEGER NOT NULL DEFAULT 0,
      embedding      BLOB,
      amend_year     INTEGER,
      amend_status   TEXT,
      amend_note     TEXT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (law_id) REFERENCES laws(id) ON DELETE CASCADE
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_articles_law ON articles(law_id);`);

  // ترقية آمنة: إضافة أعمدة التعديلات إن كانت القاعدة قديمة بلا هذه الأعمدة
  const cols = new Set(
    (db.prepare(`PRAGMA table_info(articles)`).all() as { name: string }[]).map((c) => c.name),
  );
  if (!cols.has("amend_year")) db.exec(`ALTER TABLE articles ADD COLUMN amend_year INTEGER;`);
  if (!cols.has("amend_status")) db.exec(`ALTER TABLE articles ADD COLUMN amend_status TEXT;`);
  if (!cols.has("amend_note")) db.exec(`ALTER TABLE articles ADD COLUMN amend_note TEXT;`);

  // فهرس بحث نصي كامل (FTS5) مع إزالة التشكيل لتطابق أفضل في العربية
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
      content,
      article_number,
      law_title,
      content='',
      tokenize = 'unicode61 remove_diacritics 2'
    );
  `);

  _db = db;
  return db;
}

export interface Law {
  id: number;
  title: string;
  law_number: string | null;
  year: string | null;
  category: string | null;
  source_file: string | null;
  notes: string | null;
  created_at: string;
}

export interface Article {
  id: number;
  law_id: number;
  article_number: string | null;
  heading: string | null;
  content: string;
  ordering: number;
  embedding: Buffer | null;
  amend_year: number | null;
  amend_status: string | null;
  amend_note: string | null;
  created_at: string;
}

// تحويل متجه الأرقام إلى Buffer للتخزين، والعكس
export function vectorToBlob(vec: Float32Array | number[]): Buffer {
  const f32 = vec instanceof Float32Array ? vec : Float32Array.from(vec);
  return Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
}

export function blobToVector(blob: Buffer): Float32Array {
  return new Float32Array(
    blob.buffer,
    blob.byteOffset,
    blob.byteLength / Float32Array.BYTES_PER_ELEMENT,
  );
}
