#!/usr/bin/env node

/**
 * إدخال النواقص المؤكدة من تدقيق موقع النيابة العامة إلى قاعدة التطبيق.
 * يشترط تشغيل scripts/agoye-sync.mjs أولاً.
 *
 * المعاينة: npx tsx scripts/agoye-import.mjs
 * التنفيذ:  npx tsx scripts/agoye-import.mjs --apply
 */

import fs from "node:fs";
import path from "node:path";
import { getDb, vectorToBlob } from "../lib/db.ts";
import { embedBatch } from "../lib/embeddings.ts";

const APPLY = process.argv.includes("--apply");
const DOCS_DIR = path.join(process.cwd(), "data", "incoming", "agoye", "documents");

// هذه القائمة حُسمت بعد مقارنة الرقم والسنة والمحتوى، لا بمجرد اختلاف العنوان.
const IMPORTS = [
  {
    id: 336,
    title: "المناجم والمحاجر",
    number: "24",
    year: "2002",
    category: "قانون",
    status: "repealed",
    statusNote: "أُلغي بالمادة (143) من القانون رقم (22) لسنة 2010م بشأن المناجم والمحاجر.",
  },
  {
    id: 352,
    title: "جدول السلع والمنتجات الخاضعة لضرائب الإنتاج والاستهلاك والخدمات",
    number: "13",
    year: "1999",
    category: "قرار",
  },
  {
    id: 356,
    title: "مكافحة غسل الأموال",
    number: "35",
    year: "2003",
    category: "قانون",
    status: "repealed",
    statusNote: "أُلغي بالمادة (52) من القانون رقم (1) لسنة 2010م بشأن مكافحة غسل الأموال وتمويل الإرهاب.",
  },
  {
    id: 362,
    title: "إنشاء وتنظيم النيابة العامة",
    number: "39",
    year: "1977",
    category: "قانون",
  },
  {
    id: 365,
    title: "إنشاء نيابة الأموال العامة وتحديد اختصاصها",
    number: "158",
    year: "1992",
    category: "نيابة",
  },
  {
    id: 370,
    title: "إنشاء محاكم الأحداث وتحديد اختصاصاتها",
    number: "28",
    year: "2003",
    category: "قرار",
  },
  {
    id: 371,
    title: "اللائحة التنظيمية للمحاكم الابتدائية والاستئنافية",
    number: "245",
    year: "2000",
    category: "لائحة",
    status: "repealed",
    statusNote: "أُلغي بالقرار الوزاري رقم (195) لسنة 2009م وفق المادة (60) من اللائحة اللاحقة.",
  },
  {
    id: 409,
    title: "اللائحة التنظيمية لوزارة الصناعة والتجارة",
    number: "303",
    year: "2001",
    category: "لائحة",
  },
  {
    id: 414,
    title: "اللائحة التنظيمية لوزارة النفط والثروات المعدنية",
    number: "40",
    year: "2000",
    category: "لائحة",
  },
  {
    id: 415,
    title: "اللائحة التنظيمية لوزارة النقل",
    number: "265",
    year: "1997",
    category: "لائحة",
  },
  {
    id: 441,
    title: "اتفاقية جنيف الثانية لتحسين حال جرحى ومرضى وغرقى القوات المسلحة في البحار",
    number: null,
    year: "1949",
    category: "اتفاقية",
  },
  {
    id: 472,
    title: "المعاهدة النموذجية بشأن نقل الإجراءات في المسائل الجنائية",
    number: null,
    year: "1990",
    category: "اتفاقية",
  },
  {
    id: 473,
    title: "المبادئ التوجيهية بشأن دور أعضاء النيابة العامة",
    number: null,
    year: "1990",
    category: "اتفاقية",
  },
  {
    id: 480,
    title: "الاتفاقية العربية لمكافحة الإرهاب",
    number: null,
    year: "1998",
    category: "اتفاقية",
  },
  {
    id: 481,
    title: "الإجراءات التنفيذية للاتفاقية العربية لمكافحة الإرهاب",
    number: null,
    year: "2000",
    category: "اتفاقية",
  },
];

function loadDocument(id) {
  const file = path.join(DOCS_DIR, `${id}.json`);
  if (!fs.existsSync(file)) throw new Error(`ملف المصدر غير موجود: ${file}`);
  const document = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!document.text || document.fetchError) throw new Error(`نص المصدر ${id} غير صالح`);
  return document;
}

function toArticles(document) {
  const rows = [];
  for (const block of document.blocks ?? []) {
    const content = String(block.text ?? "").trim().replace(/^[:：]\s*/, "");
    if (!content) continue;
    if (block.type === "article") {
      const number = block.num != null ? String(block.num) : null;
      rows.push({
        articleNumber: number,
        heading: number ? `المادة (${number})` : "مادة",
        content,
      });
    } else {
      rows.push({ articleNumber: null, heading: "الديباجة والنص التمهيدي", content });
    }
  }
  if (!rows.length && document.text?.trim()) {
    rows.push({ articleNumber: null, heading: "النص الكامل", content: document.text.trim() });
  }
  return rows;
}

function metadata(document, item) {
  return JSON.stringify({
    sourceName: document.sourceName,
    sourceUrl: document.sourceUrl,
    sourceId: document.sourceId,
    fetchedAt: document.fetchedAt,
    status: item.status ?? "status-needs-review",
    statusNote: item.statusNote ?? "لم تُحسم حالة السريان؛ أُدرج النص كما نشره المصدر الرسمي.",
  });
}

async function main() {
  const db = getDb();
  const existingBySource = db.prepare(`SELECT id, title FROM laws WHERE source_file = ?`);
  const existingExact = db.prepare(
    `SELECT id, title FROM laws WHERE title = ? AND COALESCE(law_number, '') = COALESCE(?, '') AND COALESCE(year, '') = COALESCE(?, '')`,
  );
  const insertLaw = db.prepare(
    `INSERT INTO laws (title, law_number, year, category, source_file, notes) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertArticle = db.prepare(
    `INSERT INTO articles (law_id, article_number, heading, content, ordering, embedding) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertFts = db.prepare(
    `INSERT INTO articles_fts (rowid, content, article_number, law_title) VALUES (?, ?, ?, ?)`,
  );

  let imported = 0;
  let skipped = 0;
  for (const item of IMPORTS) {
    const document = loadDocument(item.id);
    const sourceFile = `agoye:${item.id}`;
    const duplicate =
      existingBySource.get(sourceFile) || existingExact.get(item.title, item.number, item.year);
    const articles = toArticles(document);
    if (duplicate) {
      skipped += 1;
      console.log(`↷ موجود: ${item.title} [${duplicate.id}]`);
      continue;
    }

    console.log(
      `${APPLY ? "…" : "•"} ${item.title} — ${articles.length} مادة/كتلة` +
        (item.status === "repealed" ? " — نسخة تاريخية ملغاة" : ""),
    );
    if (!APPLY) continue;

    const vectors = await embedBatch(
      articles.map((article) => `${item.title}\n${article.heading}\n${article.content}`),
      "passage",
    );
    const transaction = db.transaction(() => {
      const lawId = insertLaw.run(
        item.title,
        item.number,
        item.year,
        item.category,
        sourceFile,
        metadata(document, item),
      ).lastInsertRowid;
      articles.forEach((article, index) => {
        const articleId = insertArticle.run(
          lawId,
          article.articleNumber,
          article.heading,
          article.content,
          index,
          vectorToBlob(vectors[index]),
        ).lastInsertRowid;
        insertFts.run(articleId, article.content, article.articleNumber ?? "", item.title);
      });
    });
    transaction();
    imported += 1;
    console.log("  ✓ أُدخل مع المصدر والمتجهات");
  }

  if (!APPLY) {
    console.log(`\nمعاينة فقط: ${IMPORTS.length - skipped} جديد، ${skipped} موجود.`);
    console.log("للتنفيذ: npx tsx scripts/agoye-import.mjs --apply");
  } else {
    console.log(`\n✅ اكتمل الإدخال: ${imported} جديد، ${skipped} موجود.`);
  }
}

main().catch((error) => {
  console.error("❌", error);
  process.exitCode = 1;
});
