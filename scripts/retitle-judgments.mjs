// إعادة عنونة القواعد القضائية (تصنيف «حكم») بشكل أرقى:
// - العنوان (label) = موضوع القاعدة (الوصف) بدل «قاعدة (N)» المجرّدة.
// - المحتوى يبدأ بسطر «قاعدة (N) — قضية رقم X — العدد … — ص Y» ثم نصّ القاعدة.
// - قائمة مسطّحة (بلا أقسام) داخل كل مجموعة أحكام.
// لا إعادة تضمين (النص الدلالي محفوظ).
//
// تجريبي: npx tsx scripts/retitle-judgments.mjs --dry
// تنفيذ:  npx tsx scripts/retitle-judgments.mjs

import { getDb } from "../lib/db.ts";

const DRY = process.argv.includes("--dry");

function cleanSubject(s) {
  return s
    .replace(/^\s*[-–]\s*/, "") // شرطة بادئة
    .replace(/\s*¦\s*/g, " • ") // فاصل البنود ¦ → •
    .replace(/\s+/g, " ")
    .replace(/ — /g, " - ") // حتى لا يكسر فاصل العنوان/القسم
    .trim();
}

function parse(content) {
  let subject = "";
  let ruling = "";
  const idx = content.indexOf("القاعدة:");
  if (idx >= 0) {
    subject = content.slice(0, idx).trim();
    ruling = content.slice(idx).trim();
  } else {
    const nl = content.indexOf("\n");
    if (nl >= 0) {
      subject = content.slice(0, nl).trim();
      ruling = content.slice(nl + 1).trim();
    } else {
      ruling = content.trim();
    }
  }
  return { subject: cleanSubject(subject), ruling };
}

function main() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT a.id, a.heading, a.content
       FROM articles a JOIN laws l ON a.law_id = l.id
       WHERE l.category = 'حكم'`,
    )
    .all();

  const plan = [];
  for (const r of rows) {
    const m = (r.heading || "").match(/^قاعدة\s*\((\d+)\)\s*—\s*(.*)$/);
    const num = m ? m[1] : null;
    const caseInfo = m ? m[2].trim() : (r.heading || "").trim();
    const { subject, ruling } = parse(r.content || "");

    const label = subject || (num ? `قاعدة (${num})` : "قاعدة قضائية");
    const ref = num ? `قاعدة (${num}) — ${caseInfo}` : caseInfo;
    const newContent = ruling ? `${ref}\n${ruling}` : `${ref}`;

    plan.push({ id: r.id, heading: label, content: newContent });
  }

  console.log(`• قواعد سيُعاد عنونتها: ${plan.length}`);
  if (DRY) {
    for (const p of plan.slice(0, 5)) {
      console.log(`\n[العنوان] ${p.heading.slice(0, 90)}`);
      console.log(`[المحتوى] ${p.content.slice(0, 130)}`);
    }
    return;
  }

  const upd = db.prepare(`UPDATE articles SET heading = ?, content = ? WHERE id = ?`);
  const tx = db.transaction(() => {
    for (const p of plan) upd.run(p.heading, p.content, p.id);
  });
  tx();
  console.log(`✓ أُعيدت عنونة ${plan.length} قاعدة (العنوان = الموضوع، والنص يبدأ بمرجع القاعدة).`);
}

main();
