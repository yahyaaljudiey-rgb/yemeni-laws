// إدراج وثيقة «القيود والأوصاف لجميع الجرائم في القانون اليمني» (إعداد القاضي خالد عمر سعيد)
// ضمن تصنيف «نيابة». كل جريمة تُصبح مادة: العنوان الوصفي + فقرة القيد/الوصف + سند المادة.
// الأقسام: عناوين القوانين العشرة (أولاً/ثانياً…) والأبواب/الفصول/الفروع.
//
// تشغيل تجريبي (بلا إدراج): npx tsx scripts/ingest-crimes-doc.mjs --dry
// إدراج فعلي:              npx tsx scripts/ingest-crimes-doc.mjs

import mammoth from "mammoth";
import { getDb, vectorToBlob } from "../lib/db.ts";
import { embedBatch } from "../lib/embeddings.ts";

const DOCX = "data/niyaba-extra/qeyod-awsaf-jaraim.docx";
const LAW_TITLE = "القيود والأوصاف لجميع الجرائم في القانون اليمني — إعداد القاضي خالد عمر سعيد";
const CATEGORY = "نيابة";
const DRY = process.argv.includes("--dry");

const stripParens = (l) => l.replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
const isSectionHdr = (l) => /^\(\s*(الكتاب|الباب|القسم|الفصل|الفرع)\s/.test(l);
const isLawHdr = (l) =>
  /^(أولاً|ثانياً|ثالثاً|رابعاً|خامساً|سادساً|سابعاً|ثامناً|تاسعاً|عاشراً)\s*:/.test(l) &&
  /القيود\s+وال[أا]وصاف/.test(l);
const isCrime = (l) => /^\(\s*جريمة/.test(l);
const isMada = (l) => /^\(\s*المادة/.test(l);

function lawLabel(l) {
  const m = l.match(/بشأن\s+(.+?)\s+اليمني/);
  const body = m ? m[1].trim() : stripParens(l).slice(0, 40);
  const num = l.match(/رقم\s*\(?\s*(\d+)\s*\)?\s*لسنة\s*(\d{4})/);
  return num ? `قانون ${body} (${num[1]}/${num[2]})` : `قانون ${body}`;
}

async function main() {
  const { value } = await mammoth.extractRawText({ path: DOCX });
  const lines = value.split("\n").map((l) => l.trim()).filter(Boolean);

  const entries = []; // { section, heading, content }
  let currentLaw = "";
  let currentSection = "";
  let heading = null;
  let buffer = [];
  let sawMada = false;

  const flush = () => {
    const content = buffer.join("\n").trim();
    if (heading || content) {
      entries.push({
        section: currentSection,
        heading: heading || "مقدمة",
        content,
      });
    }
    heading = null;
    buffer = [];
    sawMada = false;
  };

  for (const l of lines) {
    if (isLawHdr(l)) {
      flush();
      currentLaw = lawLabel(l);
      currentSection = currentLaw;
      continue;
    }
    if (isSectionHdr(l)) {
      flush();
      const s = stripParens(l);
      currentSection = currentLaw ? `${currentLaw} ‹ ${s}` : s;
      continue;
    }
    if (isCrime(l)) {
      if (heading === null) {
        heading = stripParens(l);
      } else if (sawMada) {
        flush();
        heading = stripParens(l);
      } else {
        // التكرار الثاني لاسم الجريمة (تسمية) — نضمّه للمحتوى
        buffer.push(stripParens(l));
      }
      continue;
    }
    if (isMada(l)) {
      buffer.push(stripParens(l));
      sawMada = true;
      continue;
    }
    // نص عادي (فقرة القيد/الوصف أو المقدمة)
    buffer.push(l);
  }
  flush();

  // نتجاهل المدخلات الفارغة تماماً
  const clean = entries.filter((e) => e.content || e.heading !== "مقدمة");

  console.log(`• مدخلات مُستخرَجة: ${clean.length}`);
  const withText = clean.filter((e) => e.content).length;
  console.log(`• منها بمحتوى: ${withText}`);
  const sections = [...new Set(clean.map((e) => e.section))];
  console.log(`• أقسام مميّزة: ${sections.length}`);

  if (DRY) {
    console.log("\n=== عيّنة أقسام ===");
    console.log(sections.slice(0, 14).join("\n"));
    console.log("\n=== عيّنة 3 مواد ===");
    for (const e of clean.slice(2, 5)) {
      console.log(`\n[القسم] ${e.section}`);
      console.log(`[العنوان] ${e.heading}`);
      console.log(`[المحتوى] ${e.content.slice(0, 240)}`);
    }
    return;
  }

  // ——— إدراج فعلي ———
  const db = getDb();
  const exists = db.prepare(`SELECT id FROM laws WHERE title = ?`).get(LAW_TITLE);
  if (exists) {
    console.error("✗ الوثيقة مُدرَجة مسبقاً — احذفها أولاً إن أردت إعادة الإدراج.");
    process.exit(1);
  }

  const insertLaw = db.prepare(
    `INSERT INTO laws (title, law_number, year, category, source_file) VALUES (?, ?, ?, ?, ?)`,
  );
  const insertArticle = db.prepare(
    `INSERT INTO articles (law_id, article_number, heading, content, ordering, embedding) VALUES (?, ?, ?, ?, ?, ?)`,
  );

  const items = clean.filter((e) => e.content); // نُدرج ذوات المحتوى فقط
  const embedTexts = items.map((e) => (e.section ? `${e.section}\n${e.content}` : e.content));

  console.log(`… توليد المتجهات لـ ${items.length} مادة…`);
  const embeddings = await embedBatch(embedTexts, "passage");

  const tx = db.transaction(() => {
    const lawId = insertLaw.run(LAW_TITLE, null, null, CATEGORY, "qeyod-awsaf-jaraim.docx").lastInsertRowid;
    items.forEach((e, i) => {
      const heading = e.section ? `${e.heading} — ${e.section}` : e.heading;
      insertArticle.run(lawId, null, heading, e.content, i, vectorToBlob(embeddings[i]));
    });
  });
  tx();

  console.log(`✓ أُدرجت الوثيقة «${LAW_TITLE}» بـ ${items.length} مادة تحت تصنيف «${CATEGORY}».`);
}

main();
