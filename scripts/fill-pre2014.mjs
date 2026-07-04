// تعبئة نصوص «ما قبل 2014» لمواد عُدّلت بعد 2014 ولا أصل لها في القاعدة،
// من ملف JSON يوفّره المستخدم (مصدر موثوق): { lawTitle, originals: { "رقم": "نص" } }.
//
// لكل مادة: النص الحالي (نسخة ما بعد 2014) يُنقل إلى amended_text (خلف الزر)،
// والنص المُقدَّم يصبح المحتوى الأساسي (ما قبل 2014) ويُعاد تضمينه دلالياً.
// يشترط أن تكون المادة حالياً amend_status='unrecognized' وبلا amended_text.
//
// التشغيل: npx tsx scripts/fill-pre2014.mjs data/pre2014/<file>.json

import { readFileSync } from "node:fs";
import { getDb, vectorToBlob } from "../lib/db.ts";
import { embedBatch } from "../lib/embeddings.ts";

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("الاستخدام: npx tsx scripts/fill-pre2014.mjs <ملف.json>");
    process.exit(1);
  }
  const { lawTitle, originals } = JSON.parse(readFileSync(file, "utf-8"));
  const db = getDb();
  const law = db.prepare(`SELECT id FROM laws WHERE title = ?`).get(lawTitle);
  if (!law) {
    console.error(`✗ لم يُعثر على القانون: ${lawTitle}`);
    process.exit(1);
  }

  const nums = Object.keys(originals);
  const plan = [];
  for (const num of nums) {
    const rows = db
      .prepare(
        `SELECT id, content, amend_year, amend_status, amend_note, amended_text
         FROM articles WHERE law_id = ? AND article_number = ?`,
      )
      .all(law.id, num);
    if (rows.length === 0) {
      console.error(`✗ المادة (${num}) غير موجودة في ${lawTitle} — تخطّيت.`);
      continue;
    }
    // نختار صفّ ما بعد 2014 (unrecognized) كأساس نحوّله
    const target =
      rows.find((r) => r.amend_status === "unrecognized") ?? rows[0];
    if (target.amended_text) {
      console.log(`• المادة (${num}) مُعبّأة مسبقاً — تخطّيت.`);
      continue;
    }
    plan.push({
      id: target.id,
      num,
      pre2014: originals[num].trim(),
      amendedText: target.content, // النسخة الحالية = ما بعد 2014
      amendYear: target.amend_year,
      amendNote: target.amend_note,
    });
  }

  if (plan.length === 0) {
    console.log("لا شيء للتطبيق.");
    return;
  }

  console.log(`• القانون: ${lawTitle}`);
  console.log(`• مواد ستُعبَّأ: ${plan.length} → [${plan.map((p) => p.num).join(", ")}]`);

  // إعادة تضمين النصوص الجديدة (ما قبل 2014)
  const vecs = await embedBatch(plan.map((p) => p.pre2014), "passage");

  const upd = db.prepare(
    `UPDATE articles
     SET content = ?, amended_text = ?, embedding = ?,
         amend_status = 'unrecognized', amend_year = ?, amend_note = ?
     WHERE id = ?`,
  );
  const tx = db.transaction(() => {
    plan.forEach((p, i) => {
      upd.run(
        p.pre2014,
        p.amendedText,
        vectorToBlob(vecs[i]),
        p.amendYear,
        p.amendNote ?? "تعديل بعد 2014 (غير معترف به)",
        p.id,
      );
    });
  });
  tx();

  console.log(`\n✓ عُبّئت ${plan.length} مادة (النص الأساسي = ما قبل 2014، والنسخة الحالية خلف زر التعديل).`);
}

main();
