// فهرسة جماعية لمجلد ملفات قوانين (PDF/DOCX/TXT).
// يعيد استخدام نفس خط الأنابيب: استخراج (PyMuPDF) + تقسيم مواد + تضمين دلالي + تخزين.
//
// الاستخدام:
//   npx tsx scripts/ingest-folder.mjs [مسار_المجلد]
// الافتراضي: data/telegram-pdfs

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { getDb, vectorToBlob } from "../lib/db.ts";
import { extractTextFromFile } from "../lib/extract.ts";
import { parseArticles } from "../lib/parser.ts";
import { embedBatch } from "../lib/embeddings.ts";

const dir = process.argv[2] || "data/telegram-pdfs";
const SUPPORTED = /\.(pdf|docx|txt|md)$/i;

// عنوان نظيف من اسم الملف: نزيل بادئة معرّف الرسالة "123__" والامتداد والشرطات السفلية
function titleFromFilename(name) {
  return name
    .replace(/^\d+__/, "")
    .replace(SUPPORTED, "")
    .replace(/[_]+/g, " ")
    .trim();
}

async function main() {
  const db = getDb();
  let files;
  try {
    files = readdirSync(dir).filter((f) => SUPPORTED.test(f)).sort();
  } catch {
    console.error(`✗ تعذّر قراءة المجلد: ${dir}`);
    process.exit(1);
  }

  if (files.length === 0) {
    console.error(`لا توجد ملفات مدعومة في ${dir}`);
    process.exit(1);
  }

  console.log(`• المجلد: ${dir}`);
  console.log(`• عدد الملفات: ${files.length}\n`);

  const existing = new Set(
    db.prepare(`SELECT source_file FROM laws`).all().map((r) => r.source_file),
  );

  const insertLaw = db.prepare(
    `INSERT INTO laws (title, law_number, year, category, source_file)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const insertArticle = db.prepare(
    `INSERT INTO articles (law_id, article_number, heading, content, ordering, embedding)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertFts = db.prepare(
    `INSERT INTO articles_fts (rowid, content, article_number, law_title)
     VALUES (?, ?, ?, ?)`,
  );

  let done = 0;
  let skipped = 0;
  let failed = 0;
  let totalArticles = 0;

  for (const file of files) {
    const idx = `${done + skipped + failed + 1}/${files.length}`;
    if (existing.has(file)) {
      skipped++;
      console.log(`↷ [${idx}] موجود مسبقاً: ${file}`);
      continue;
    }

    const title = titleFromFilename(file) || file;
    try {
      const buffer = readFileSync(path.join(dir, file));
      const text = await extractTextFromFile(file, buffer);
      const parsed = parseArticles(text);

      if (parsed.length === 0 || (parsed.length === 1 && !parsed[0].article_number)) {
        // لم تُكتشف مواد — قد يكون ملفاً ممسوحاً (صورة) أو تنسيقاً غير متوقّع
        failed++;
        console.log(`⚠ [${idx}] بلا مواد قابلة للتقسيم: ${file}`);
        continue;
      }

      process.stdout.write(`… [${idx}] ${title} — ${parsed.length} مادة، جارٍ التضمين…`);
      const embeddings = await embedBatch(parsed.map((a) => a.content), "passage");

      const tx = db.transaction(() => {
        const lawId = insertLaw.run(title, null, null, null, file).lastInsertRowid;
        parsed.forEach((art, i) => {
          const aid = insertArticle.run(
            lawId,
            art.article_number,
            art.heading,
            art.content,
            i,
            vectorToBlob(embeddings[i]),
          ).lastInsertRowid;
          insertFts.run(aid, art.content, art.article_number ?? "", title);
        });
      });
      tx();

      done++;
      totalArticles += parsed.length;
      console.log(` ✓`);
    } catch (e) {
      failed++;
      console.log(`\n✗ [${idx}] فشل ${file}: ${e?.message || e}`);
    }
  }

  console.log(
    `\nانتهى. فُهرس: ${done} قانوناً (${totalArticles} مادة) | موجود مسبقاً: ${skipped} | فشل/بلا مواد: ${failed}`,
  );
}

main();
