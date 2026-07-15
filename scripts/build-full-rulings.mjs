#!/usr/bin/env node
// يبني بيانات «الأحكام بنصّها الكامل» بترتيب الدائرة ← السنة ← الحكم:
//   public/data/full-rulings-index.json         (فهرس خفيف: دوائر ← سنوات ← ملفّ)
//   public/data/full-rulings/commercial-<سنة>.json  (ملفّ لكل سنة، يُحمّل كسولًا)
//
// المصدر: حزمة موحّدة index.sqlite3 (documents فيها judgment_year/source_year).
// السنة المعتمدة = COALESCE(judgment_year, source_year).
//
// الاستخدام:
//   node scripts/build-full-rulings.mjs \
//     data/incoming/extracted-multi/index.sqlite3 commercial التجارية

import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const SRC = process.argv[2] || "data/incoming/extracted-multi/index.sqlite3";
const DIV_KEY = process.argv[3] || "commercial";
const DIV_AR = process.argv[4] || "التجارية";
const OUT_DIR = "public/data/full-rulings";
const INDEX = "public/data/full-rulings-index.json";
const PAGE_SEP = "\n\n——— صفحة {n} ———\n\n";

function q(sql) {
  const out = execFileSync("sqlite3", ["-json", SRC, sql], {
    encoding: "utf8", maxBuffer: 1024 * 1024 * 1024,
  }).trim();
  return out ? JSON.parse(out) : [];
}

mkdirSync(OUT_DIR, { recursive: true });

const years = q(
  "SELECT COALESCE(judgment_year, source_year) AS yr, COUNT(*) c " +
  "FROM documents GROUP BY yr HAVING yr IS NOT NULL ORDER BY yr"
).map((r) => Number(r.yr));

const yearEntries = [];
for (const year of years) {
  const docs = q(
    "SELECT document_id, case_number, title, hijri_date, gregorian_date, page_count " +
    `FROM documents WHERE COALESCE(judgment_year, source_year)=${year} ` +
    "ORDER BY CAST(case_number AS INTEGER)"
  );
  const rulings = [];
  let pages = 0;
  for (const d of docs) {
    const ps = q(
      `SELECT page_number, text FROM pages WHERE document_id='${d.document_id}' ORDER BY page_number`
    );
    const heads = q(
      `SELECT title FROM sections WHERE document_id='${d.document_id}' ORDER BY ordinal LIMIT 1`
    ).map((r) => (r.title || "").trim()).filter(Boolean);
    let text = "";
    for (const p of ps) {
      const t = (p.text || "").trim();
      if (!t) continue;
      text += (p.page_number > 1 ? PAGE_SEP.replace("{n}", p.page_number) : "") + t;
      pages++;
    }
    const subject = heads[0] ||
      (text.split("\n").map((s) => s.trim()).find((s) => s.length > 15) || "").slice(0, 120);
    rulings.push({
      id: String(d.case_number), case: String(d.case_number),
      title: `الطعن ${DIV_AR} رقم ${d.case_number}`,
      hijriDate: d.hijri_date || "", gregorianDate: d.gregorian_date || "",
      pageCount: d.page_count || ps.length, subject, text,
    });
  }
  const file = `full-rulings/${DIV_KEY}-${year}.json`;
  const payload = {
    divisionKey: DIV_KEY, division: DIV_AR, year,
    court: "المحكمة العليا اليمنية", source: "المكتب الفني للمحكمة العليا اليمنية",
    totalRulings: rulings.length, totalPages: pages, rulings,
  };
  writeFileSync(`public/data/${file}`, JSON.stringify(payload));
  yearEntries.push({ year, count: rulings.length, pages, file });
  const mb = (JSON.stringify(payload).length / 1048576).toFixed(1);
  console.log(`  ${year}: ${rulings.length} حكماً، ${pages} صفحة، ${mb}MB`);
}

const index = {
  generatedAt: new Date().toISOString(),
  divisions: [{
    key: DIV_KEY, name: DIV_AR,
    total: yearEntries.reduce((s, y) => s + y.count, 0),
    years: yearEntries,
  }],
};
writeFileSync(INDEX, JSON.stringify(index));
console.log(`✓ ${INDEX}: ${index.divisions[0].total} حكماً في ${yearEntries.length} سنوات`);
