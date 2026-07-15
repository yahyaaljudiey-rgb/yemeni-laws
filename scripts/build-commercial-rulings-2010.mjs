#!/usr/bin/env node
// يبني public/data/commercial-rulings-2010.json من حزمة commercial_judgments_2010
// (296 حكماً تجارياً كاملاً 2010). نافذة مستقلّة عن القواعد — لا يدخل البحث الرئيسي.
//
// الاستخدام:
//   node scripts/build-commercial-rulings-2010.mjs \
//     data/incoming/extracted/commercial_judgments_2010/index.sqlite3
//
// يعتمد على أمر sqlite3 (CLI) لقراءة المصدر بلا اعتماديات جديدة.

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const SRC = process.argv[2] ||
  "data/incoming/extracted/commercial_judgments_2010/index.sqlite3";
const OUT = "public/data/commercial-rulings-2010.json";
const PAGE_SEP = "\n\n——— صفحة {n} ———\n\n";

function q(sql) {
  const out = execFileSync("sqlite3", ["-json", SRC, sql], {
    encoding: "utf8", maxBuffer: 512 * 1024 * 1024,
  }).trim();
  return out ? JSON.parse(out) : [];
}

const docs = q(
  "SELECT document_id, case_number, title, hijri_date, gregorian_date, page_count " +
  "FROM documents ORDER BY CAST(case_number AS INTEGER)"
);

const rulings = [];
let totalPages = 0;
for (const d of docs) {
  const pages = q(
    `SELECT page_number, text FROM pages WHERE document_id='${d.document_id}' ORDER BY page_number`
  );
  const heads = q(
    `SELECT title FROM sections WHERE document_id='${d.document_id}' ORDER BY ordinal LIMIT 6`
  ).map((r) => (r.title || "").trim()).filter(Boolean);

  let text = "";
  for (const p of pages) {
    const t = (p.text || "").trim();
    if (!t) continue;
    text += (p.page_number > 1 ? PAGE_SEP.replace("{n}", p.page_number) : "") + t;
    totalPages++;
  }
  // موضوع مختصر للقائمة: أول عنوان داخلي، وإلا أول سطر ذي معنى
  const subject = heads[0] ||
    (text.split("\n").map((s) => s.trim()).find((s) => s.length > 15) || "").slice(0, 120);

  rulings.push({
    id: String(d.case_number),
    case: String(d.case_number),
    title: `الطعن التجاري رقم ${d.case_number}`,
    hijriDate: d.hijri_date || "",
    gregorianDate: d.gregorian_date || "",
    pageCount: d.page_count || pages.length,
    subject,
    headings: heads,
    text,
  });
}

const payload = {
  generatedAt: new Date().toISOString(),
  source: "المكتب الفني للمحكمة العليا اليمنية",
  court: "المحكمة العليا اليمنية",
  division: "الدائرة التجارية",
  year: 2010,
  totalRulings: rulings.length,
  totalPages,
  rulings,
};

writeFileSync(OUT, JSON.stringify(payload));
const mb = (JSON.stringify(payload).length / 1048576).toFixed(2);
console.log(`✓ ${OUT}: ${rulings.length} حكماً، ${totalPages} صفحة، ${mb}MB`);
