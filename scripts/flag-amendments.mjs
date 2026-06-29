// يمسح كل المواد المُخزَّنة، يكتشف علامات التعديل ((( ... )))، ويملأ
// الأعمدة amend_year / amend_status / amend_note. لا يُعيد التضمين (سريع).
//
// الاستخدام: npx tsx scripts/flag-amendments.mjs

import { getDb } from "../lib/db.ts";
import { extractAmendments, RECOGNITION_CUTOFF_YEAR } from "../lib/amendments.ts";

const db = getDb();
const rows = db.prepare(`SELECT id, content FROM articles`).all();
const update = db.prepare(
  `UPDATE articles SET amend_year = ?, amend_status = ?, amend_note = ? WHERE id = ?`,
);

let flagged = 0, unrecognized = 0;
const tx = db.transaction(() => {
  for (const r of rows) {
    const info = extractAmendments(r.content);
    if (info.status == null) {
      update.run(null, null, null, r.id);
      continue;
    }
    flagged++;
    if (info.status === "unrecognized") unrecognized++;
    update.run(info.latestYear, info.status, info.notes.join(" | ").slice(0, 1000), r.id);
  }
});
tx();

console.log(`إجمالي المواد: ${rows.length}`);
console.log(`مواد فيها تعديل: ${flagged}`);
console.log(`  • معترف بها (حتى ${RECOGNITION_CUTOFF_YEAR}): ${flagged - unrecognized}`);
console.log(`  • غير معترف بها (بعد ${RECOGNITION_CUTOFF_YEAR}): ${unrecognized}`);
