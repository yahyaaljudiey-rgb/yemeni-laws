// استخراج الأحكام القضائية (بنصّها الكامل) من ملفات JSON المُستخرجة من تطبيق الزميل (Flutter).
// المصدر: assets/flutter_assets/assets/judgments/*.json
// الناتج: public/data/judgments.json — مُنظَّم حسب الفئة ثم العدد.
//
// الاستخدام: node scripts/extract-judgments.mjs <مجلد_judgments>

import fs from "node:fs";
import path from "node:path";

const SRC = process.argv[2];
const OUT = path.join(process.cwd(), "public", "data", "judgments.json");

// الأرقام العربية الترتيبية → رقم (لترتيب الأعداد)
const ORD = {
  "الاول": 1, "الأول": 1, "الثاني": 2, "الثالث": 3, "الرابع": 4, "الخامس": 5,
  "السادس": 6, "السابع": 7, "الثامن": 8, "التاسع": 9, "العاشر": 10,
  "الحادي عشر": 11, "الثاني عشر": 12, "الثالث عشر": 13, "الرابع عشر": 14,
  "الخامس عشر": 15, "السادس عشر": 16, "السابع عشر": 17, "الثامن عشر": 18,
  "التاسع عشر": 19, "العشرون": 20, "الواحد والعشرون": 21,
};

// فئة الحكم من عنوان المجموعة
function categoryOf(t) {
  const c = t.replace("المدنينة", "المدنية");
  if (c.startsWith("الجزائية")) return "جزائية";
  if (c.startsWith("المدنية")) return "مدنية";
  if (c.startsWith("التجارية")) return "تجارية";
  if (c.startsWith("الإدارية") || c.startsWith("الادارية")) return "إدارية";
  if (c.startsWith("الدستورية")) return "دستورية";
  if (c.startsWith("الشخصية")) return "شخصية";
  return "أخرى";
}

// رقم العدد للترتيب (بعد كلمة «العدد»)
function issueNumOf(t) {
  const m = t.match(/العدد\s+(.+)$/);
  if (!m) return 99;
  const s = m[1].trim().replace(/\s+/g, " ");
  for (const [name, num] of Object.entries(ORD).sort((a, b) => b[0].length - a[0].length)) {
    if (s.includes(name)) return num;
  }
  return 99;
}

function main() {
  const files = fs.readdirSync(SRC).filter((f) => f.endsWith(".json"));
  const collections = [];
  let totalRules = 0;
  let withFull = 0;

  for (const file of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(SRC, file), "utf8"));
    const collection = decodeURIComponent(file.replace(/\.json$/, "")).trim();
    const category = categoryOf(collection);
    const issueNum = issueNumOf(collection);

    const rules = raw
      .map((r) => {
        const subject = (r.subject || "").trim();
        const content = (r.content || "").trim();
        if (!subject && !content) return null;
        if (content.length > 50) withFull++;
        totalRules++;
        return {
          n: String(r.rule_number || "").trim(),
          case: String(r.case_number || "").trim(),
          page: String(r.page || "").trim(),
          subject,
          content, // النصّ الكامل (قد يكون فارغاً لبعض القواعد)
        };
      })
      .filter(Boolean)
      .sort((a, b) => (Number(a.n) || 0) - (Number(b.n) || 0));

    collections.push({
      id: `${category}-${issueNum}`,
      collection,
      category,
      issueNum,
      count: rules.length,
      rules,
    });
  }

  // ترتيب: حسب الفئة ثم رقم العدد
  const catOrder = ["جزائية", "مدنية", "تجارية", "إدارية", "شخصية", "دستورية", "أخرى"];
  collections.sort(
    (a, b) =>
      catOrder.indexOf(a.category) - catOrder.indexOf(b.category) ||
      a.issueNum - b.issueNum,
  );

  const out = {
    generatedAt: new Date().toISOString(),
    source: "المكتب الفني للمحكمة العليا اليمنية",
    categories: catOrder.filter((c) => collections.some((x) => x.category === c)),
    totalCollections: collections.length,
    totalRules,
    withFullText: withFull,
    collections,
  };

  fs.writeFileSync(OUT, JSON.stringify(out), "utf8");
  const kb = Math.round(fs.statSync(OUT).size / 1024);
  console.log(
    `✓ ${OUT}\n  مجموعات: ${collections.length} | قواعد: ${totalRules} | بنصّ كامل: ${withFull} | الحجم: ${kb}KB`,
  );
}

main();
