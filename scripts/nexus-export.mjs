// تصدير مجموعة القوانين اليمنية إلى نواة Nexus (المرحلة 9)
//
// المبدأ: Nexus يعيد التقطيع والتضمين بنفسه (bge-m3)، فلا ننقل متجهاتنا.
// ننقل لكل قانون *وثيقة نصية نظيفة* (Markdown) + بيانات وصفية غنية.
// كل مادة تُفصَل بسطر فارغ لتصير قطعة ذرّية يحترمها مُقطِّع Nexus (~800 حرف).
//
// وضعان:
//   1) تصدير ملفات (دون خادم):
//        node scripts/nexus-export.mjs [--out nexus-corpus]
//      ثم على الخادم:  docker cp nexus-corpus nexus-api:/data/knowledge/yemeni-laws
//                      POST /index {"path": "/data/knowledge/yemeni-laws"}
//
//   2) رفع مباشر إلى Nexus حيّ (بيانات وصفية لكل قانون عبر /documents):
//        node scripts/nexus-export.mjs --post https://nexus.example.com --key <X-API-Key>
//
// خيارات: --limit N (للتجربة) · --out DIR · --post URL · --key KEY

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DB_PATH = path.join(process.cwd(), "data", "laws.db");

// --- تحليل الوسائط ---
const argv = process.argv.slice(2);
function flag(name, def = null) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
}
const OUT_DIR = path.resolve(process.cwd(), flag("--out", "nexus-corpus"));
const POST_URL = flag("--post");
const API_KEY = flag("--key");
const LIMIT = Number(flag("--limit", "0")) || 0;

// اسم ملف آمن وفريد: {id}-{slug}
function slugify(title, id) {
  const slug = (title || "")
    .replace(/[‎‏‪-‮؜]/g, "")
    .replace(/[/\\?%*:|"<>.]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `${id}-${slug || "law"}`;
}

// بناء نصّ Markdown لقانون واحد من مواده
function buildMarkdown(law, articles) {
  const lines = [`# ${law.title}`, ""];
  const meta = [
    `النوع: ${law.category || "قانون"}`,
    law.law_number ? `رقم: ${law.law_number}` : null,
    law.year ? `السنة: ${law.year}` : null,
    law.source_file ? `المصدر: ${law.source_file}` : null,
  ].filter(Boolean).join(" · ");
  lines.push(`> ${meta}`, "");

  for (const a of articles) {
    const heading = a.article_number
      ? `## مادة (${a.article_number})`
      : a.heading
        ? `## ${a.heading.split(" — ")[0]}`
        : null;
    if (heading) lines.push(heading);
    lines.push((a.content || "").trim());
    if (a.amend_status && String(a.amend_status).trim()) {
      const note = a.amend_note ? ` — ${a.amend_note}` : "";
      lines.push(`> [تعديل${a.amend_year ? ` ${a.amend_year}` : ""}: ${a.amend_status}${note}]`);
    }
    lines.push(""); // سطر فارغ يفصل المواد (حدود التقطيع)
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

async function postDocument(law, content) {
  const headers = { "Content-Type": "application/json" };
  if (API_KEY) headers["X-API-Key"] = API_KEY;
  const res = await fetch(`${POST_URL.replace(/\/+$/, "")}/documents`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      content,
      title: law.title,
      metadata: {
        law_id: law.id,
        law_number: law.law_number,
        year: law.year,
        category: law.category,
        source: law.source_file,
        jurisdiction: "yemen",
      },
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);
  return data; // { id, title, chunk_count, ... }
}

async function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error("❌ لا توجد قاعدة بيانات في", DB_PATH);
    process.exit(1);
  }
  const db = new Database(DB_PATH, { readonly: true });
  let laws = db.prepare(
    `SELECT id, title, law_number, year, category, source_file FROM laws ORDER BY id`,
  ).all();
  if (LIMIT) laws = laws.slice(0, LIMIT);

  const artStmt = db.prepare(
    `SELECT article_number, heading, content, amend_year, amend_status, amend_note
     FROM articles WHERE law_id = ? ORDER BY ordering, id`,
  );

  const posting = Boolean(POST_URL);
  if (!posting) fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(posting ? `• الرفع إلى: ${POST_URL}` : `• التصدير إلى: ${OUT_DIR}`);
  console.log(`• عدد القوانين: ${laws.length}\n`);

  let done = 0, chunks = 0, empty = 0, failed = 0;
  for (const law of laws) {
    const articles = artStmt.all(law.id);
    const md = buildMarkdown(law, articles);
    if (!articles.length || md.trim().length < 40) { empty++; continue; }

    if (posting) {
      try {
        const out = await postDocument(law, md);
        chunks += out?.chunk_count || 0;
        done++;
        if (done % 25 === 0) console.log(`  … ${done}/${laws.length}`);
      } catch (e) {
        failed++;
        console.log(`✗ [${law.id}] ${law.title.slice(0, 40)}: ${e.message}`);
      }
    } else {
      fs.writeFileSync(path.join(OUT_DIR, `${slugify(law.title, law.id)}.md`), md, "utf8");
      done++;
    }
  }

  console.log(
    `\nانتهى. ${posting ? "رُفع" : "صُدِّر"}: ${done} قانوناً` +
    (posting ? ` (${chunks} قطعة) | فشل: ${failed}` : "") +
    ` | بلا مواد: ${empty}`,
  );
}

main();
