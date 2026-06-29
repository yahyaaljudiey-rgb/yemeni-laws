// فهرسة قوانين من ملفات JSON الخاصة بتطبيق القوانين اليمنية (Flutter).
// كل ملف = قائمة كتل: preamble | section | article | side_title | conclusion.
//
// الاستخدام:
//   npx tsx scripts/ingest-json.mjs [مسار_المجلد]
// الافتراضي: data/app-data/laws

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { getDb, vectorToBlob } from "../lib/db.ts";
import { embedBatch } from "../lib/embeddings.ts";

const dir = process.argv[2] || "data/app-data/laws";
// تصنيف المستند: "قانون" افتراضاً، أو "لائحة"/"حكم" حسب المجلد
const category = process.argv[3] || "قانون";

// استخراج العنوان والرقم والسنة من اسم الملف
function parseFilename(file) {
  const name = decodeURIComponent(file).replace(/\.json$/i, "").trim();
  // النمط (أ): "الاسم 21-1996"
  let m = name.match(/^(.*?)\s+(\d+)-(\d{4})$/);
  if (m) return { title: m[1].trim(), number: m[2], year: m[3] };
  // النمط (ب): "الاسم (23) لسنة 1990م"
  m = name.match(/^(.*?)\s*\((\d+)\)\s*لسنة\s*(\d{4})/);
  if (m) return { title: m[1].trim(), number: m[2], year: m[3] };
  return { title: name, number: null, year: null };
}

// تحويل كتل قانون واحد إلى قائمة مواد قابلة للفهرسة، مع تتبّع القسم الحالي
function blocksToArticles(blocks, lawTitle) {
  const out = [];
  let section = "";
  for (const b of blocks) {
    const type = b?.type;
    // كتلة حكم قضائي: بنية مختلفة (subject + content + rule_number)
    if (b && b.content != null && (b.rule_number != null || b.subject != null)) {
      const subject = (b.subject || "").trim();
      const ruling = (b.content || "").trim();
      const body = [subject, ruling].filter(Boolean).join("\n");
      if (!body) continue;
      const rn = b.rule_number != null ? String(b.rule_number) : null;
      const caseInfo = [
        b.case_number != null ? `قضية رقم ${b.case_number}` : "",
        b.issue_number ? `العدد ${b.issue_number}` : "",
        b.page != null ? `ص ${b.page}` : "",
      ]
        .filter(Boolean)
        .join(" — ");
      out.push({
        article_number: rn,
        heading: rn ? `قاعدة (${rn})` : "قاعدة قضائية",
        content: body,
        section: caseInfo,
      });
      continue;
    }
    if (type === "section" || type === "side_title") {
      section = (b.title || b.text || "").trim();
      continue;
    }
    if (type === "preamble") {
      const text = (b.text || "").trim();
      if (text) out.push({ article_number: null, heading: "الديباجة", content: text, section: "" });
      continue;
    }
    if (type === "conclusion") {
      const text = (b.text || "").trim();
      if (text) out.push({ article_number: null, heading: "الخاتمة", content: text, section: "" });
      continue;
    }
    if (type === "article") {
      let text = (b.text || "").trim().replace(/^[:：]\s*/, "");
      if (!text) continue;
      const num = b.num != null ? String(b.num) : (b.article_number != null ? String(b.article_number) : null);
      out.push({
        article_number: num,
        heading: num ? `المادة (${num})` : "مادة",
        content: text,
        section,
      });
    }
  }
  return out;
}

async function main() {
  const db = getDb();
  let files;
  try {
    files = readdirSync(dir).filter((f) => /\.json$/i.test(f) && f !== "laws_index.json").sort();
  } catch {
    console.error(`✗ تعذّر قراءة المجلد: ${dir}`);
    process.exit(1);
  }

  // نتجاهل ملف الفهرس إن وُجد بأي اسم
  files = files.filter((f) => !/^laws_index/i.test(decodeURIComponent(f)));

  console.log(`• المجلد: ${dir}`);
  console.log(`• التصنيف: ${category}`);
  console.log(`• عدد الملفات: ${files.length}\n`);

  const existing = new Set(
    db.prepare(`SELECT source_file FROM laws`).all().map((r) => r.source_file),
  );
  const insertLaw = db.prepare(
    `INSERT INTO laws (title, law_number, year, category, source_file) VALUES (?, ?, ?, ?, ?)`,
  );
  const insertArticle = db.prepare(
    `INSERT INTO articles (law_id, article_number, heading, content, ordering, embedding) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertFts = db.prepare(
    `INSERT INTO articles_fts (rowid, content, article_number, law_title) VALUES (?, ?, ?, ?)`,
  );

  let done = 0, skipped = 0, failed = 0, totalArticles = 0;

  for (const file of files) {
    const idx = `${done + skipped + failed + 1}/${files.length}`;
    if (existing.has(file)) { skipped++; continue; }

    const { title, number, year } = parseFilename(file);
    try {
      const blocks = JSON.parse(readFileSync(path.join(dir, file), "utf-8"));
      const articles = blocksToArticles(blocks, title);
      if (articles.length === 0) { failed++; console.log(`⚠ [${idx}] بلا مواد: ${title}`); continue; }

      // نص التضمين: نضيف القسم كسياق عند وجوده لتحسين البحث الدلالي
      const embedTexts = articles.map((a) =>
        a.section ? `${a.section}\n${a.content}` : a.content,
      );
      process.stdout.write(`… [${idx}] ${title} — ${articles.length} مادة…`);
      const embeddings = await embedBatch(embedTexts, "passage");

      const tx = db.transaction(() => {
        const lawId = insertLaw.run(title, number, year, category, file).lastInsertRowid;
        articles.forEach((a, i) => {
          const heading = a.section ? `${a.heading} — ${a.section}` : a.heading;
          const aid = insertArticle.run(
            lawId, a.article_number, heading, a.content, i, vectorToBlob(embeddings[i]),
          ).lastInsertRowid;
          insertFts.run(aid, a.content, a.article_number ?? "", title);
        });
      });
      tx();
      done++; totalArticles += articles.length;
      console.log(` ✓`);
    } catch (e) {
      failed++;
      console.log(`\n✗ [${idx}] فشل ${title}: ${e?.message || e}`);
    }
  }

  console.log(`\nانتهى. فُهرس: ${done} قانوناً (${totalArticles} مادة) | موجود: ${skipped} | فشل: ${failed}`);
}

main();
