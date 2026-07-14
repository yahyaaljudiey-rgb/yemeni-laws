// يبني فهرس المواضيع (حسب الدوائر) لنافذة الأحكام من فهرس تطبيق الزميل
// (data/app-data/alahkam/faharas-alahkam.json)، ويحسب لكل موضوع عدد القواعد
// المطابقة في judgments.json، ويرتّب الغنيّ أولاً. يكتب النتيجة في
// public/data/judgments.json تحت المفتاح topicIndex بالصيغة:
//   { "الدائرة …": [ [الموضوع, العدد], … ] }
//
// الاستخدام: node scripts/build-judgment-topics.mjs

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const FAHARAS = path.join(ROOT, "data", "app-data", "alahkam", "faharas-alahkam.json");
const JUD = path.join(ROOT, "public", "data", "judgments.json");

// نفس تطبيع البحث في التطبيق (lib/client-search.ts) لضمان تطابق العدّاد مع النقر
function normalizeAr(s) {
  return s
    .replace(/[ً-ْٰ]/g, "")
    .replace(/[إأآٱا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ء/g, "")
    .replace(/ة/g, "ه")
    .replace(/ـ/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function main() {
  const faharas = JSON.parse(fs.readFileSync(FAHARAS, "utf8"));
  const jud = JSON.parse(fs.readFileSync(JUD, "utf8"));

  // نصوص القواعد مطبَّعة مسبقاً (للعدّ السريع)
  const ruleTexts = jud.collections
    .flatMap((c) => c.rules)
    .map((r) => normalizeAr(`${r.subject || ""} ${r.content || ""}`));

  const countFor = (topic) => {
    const q = normalizeAr(topic);
    if (!q) return 0;
    let n = 0;
    for (const t of ruleTexts) if (t.includes(q)) n++;
    return n;
  };

  const topicIndex = {};
  let topics = 0;
  let zero = 0;
  for (const [chamber, list] of Object.entries(faharas)) {
    const seen = new Set();
    const entries = [];
    for (const raw of list) {
      const topic = String(raw).trim();
      if (!topic || seen.has(topic)) continue; // إزالة التكرار الحرفي
      seen.add(topic);
      const c = countFor(topic);
      entries.push([topic, c]);
      topics++;
      if (c === 0) zero++;
    }
    // ترتيب: الأغنى أولاً ثم أبجدياً
    entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ar"));
    topicIndex[chamber] = entries;
  }

  jud.topicIndex = topicIndex;
  fs.writeFileSync(JUD, JSON.stringify(jud), "utf8");

  const withContent = topics - zero;
  console.log(
    `✓ topicIndex: ${Object.keys(topicIndex).length} دوائر | ${topics} موضوعاً ` +
      `(${withContent} بقواعد، ${zero} بلا قواعد بعد) → ${path.relative(ROOT, JUD)}`,
  );
}

main();
