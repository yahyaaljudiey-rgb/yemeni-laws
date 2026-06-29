// تصدير حزمة بيانات ثابتة للعمل دون إنترنت (offline-first)
// يقرأ data/laws.db ويُخرج إلى public/data:
//   - laws.json       بيانات القوانين
//   - articles.json   نصوص المواد + بيانات التعديل (بلا متجهات)
//   - embeddings.bin  متجهات مُعبَّأة (Float32، n×dim) بترتيب articles.json
//   - meta.json       {count, dim, generatedAt, lawCount}
//
// الهدف: يحمّل المتصفّح هذه الملفات مرّة، فيبحث محلياً دون خادم.
// التشغيل: node scripts/export-bundle.mjs   (أو npx tsx)

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DB_PATH = path.join(process.cwd(), "data", "laws.db");
const OUT_DIR = path.join(process.cwd(), "public", "data");

function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error("❌ لا توجد قاعدة بيانات في", DB_PATH);
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const db = new Database(DB_PATH, { readonly: true });

  // 1) القوانين
  const laws = db
    .prepare(
      `SELECT id, title, law_number, year, category FROM laws ORDER BY id`,
    )
    .all();

  // 2) المواد (بترتيب ثابت) — نصوص + بيانات تعديل + المتجه
  const rows = db
    .prepare(
      `SELECT id, law_id, article_number, heading, content, ordering,
              amend_year, amend_status, amend_note, embedding
       FROM articles
       WHERE embedding IS NOT NULL
       ORDER BY law_id, ordering, id`,
    )
    .all();

  if (rows.length === 0) {
    console.error("❌ لا توجد مواد ذات متجهات. شغّل الفهرسة أولاً.");
    process.exit(1);
  }

  // أبعاد المتجه من أول صف
  const dim = rows[0].embedding.byteLength / Float32Array.BYTES_PER_ELEMENT;

  // مصفوفة المتجهات المُعبَّأة
  const packed = Buffer.allocUnsafe(rows.length * dim * Float32Array.BYTES_PER_ELEMENT);
  const articles = new Array(rows.length);

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.embedding.byteLength !== dim * 4) {
      console.error(`❌ بُعد متجه غير متطابق في المادة ${r.id}`);
      process.exit(1);
    }
    r.embedding.copy(packed, i * dim * 4);
    articles[i] = {
      id: r.id,
      law_id: r.law_id,
      article_number: r.article_number,
      heading: r.heading,
      content: r.content,
      amend_year: r.amend_year,
      amend_status: r.amend_status,
      amend_note: r.amend_note,
    };
  }

  // تقسيم المتجهات إلى أجزاء ≤23MB (حدّ Cloudflare Pages = 25 MiB للملف الواحد)
  // التقسيم على حدود الصفوف (dim×4 بايت) ليبقى كل جزء صفوفاً كاملة.
  const rowBytes = dim * 4;
  const maxRowsPerShard = Math.floor((23 * 1024 * 1024) / rowBytes);
  const shards = [];
  // إزالة ملفّ موحَّد قديم إن وُجد (لتفادي رفع زائد)
  const legacy = path.join(OUT_DIR, "embeddings.bin");
  if (fs.existsSync(legacy)) fs.unlinkSync(legacy);
  for (let start = 0, idx = 0; start < rows.length; start += maxRowsPerShard, idx++) {
    const end = Math.min(start + maxRowsPerShard, rows.length);
    const name = `embeddings-${String(idx).padStart(3, "0")}.bin`;
    const slice = packed.subarray(start * rowBytes, end * rowBytes);
    fs.writeFileSync(path.join(OUT_DIR, name), slice);
    shards.push({ name, bytes: slice.byteLength });
  }

  const meta = {
    count: rows.length,
    dim,
    lawCount: laws.length,
    model: "Xenova/multilingual-e5-small",
    shards,
    generatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(path.join(OUT_DIR, "laws.json"), JSON.stringify(laws));
  fs.writeFileSync(path.join(OUT_DIR, "articles.json"), JSON.stringify(articles));
  fs.writeFileSync(path.join(OUT_DIR, "meta.json"), JSON.stringify(meta, null, 2));

  const mb = (n) => (n / 1024 / 1024).toFixed(1) + "MB";
  console.log("✅ تمّ تصدير الحزمة إلى public/data:");
  console.log(`   laws.json       ${laws.length} قانون`);
  console.log(`   articles.json   ${articles.length} مادة`);
  console.log(`   embeddings      ${shards.length} جزء، ${mb(packed.byteLength)} إجمالاً (${dim} بُعد)`);
  console.log(`   الإجمالي للتنزيل ≈ ${mb(
    packed.byteLength +
      fs.statSync(path.join(OUT_DIR, "articles.json")).size,
  )}`);

  db.close();
}

main();
