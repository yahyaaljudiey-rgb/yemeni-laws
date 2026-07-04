// دمج نسخة «ما قبل 2014» لقانون المرافعات والتنفيذ المدني.
// لكل مادة عُدّلت بعد 2014 (amend_status='unrecognized'):
//   - النص الأساسي (content) يصبح نسخة ما قبل 2014 (المعترف بها):
//       * إن وُجد صفّ معترف به في القاعدة → نستخدمه (نُبقي متجهه).
//       * وإلا (5 مواد لا أصل لها) → نستخدم النص المُدقّق من الـPDF ونُعيد تضمينه.
//   - نخزّن نص ما بعد 2014 في amended_text (يُعرض خلف زر في الواجهة).
//   - نحذف الصفوف المكررة الأخرى لنفس المادة (تبقى مادة بصفّ واحد).
//
// التشغيل: npx tsx scripts/merge-marafaat-pre2014.mjs

import { getDb, vectorToBlob } from "../lib/db.ts";
import { embedBatch } from "../lib/embeddings.ts";

const LAW_TITLE = "المرافعات والتنفيذ المدني وتعديلاته";

// النصوص الأصلية (ما قبل 2014) للمواد الخمس التي لا أصل لها في الـAPK —
// مُستخرجة من PDF الذي أرسله المستخدم ومُدقّقة يدوياً (عُطب لام-ألف/الهمزات في الـPDF).
const PDF_ORIGINALS = {
  "111": "العطلات الرسمية والقضائية توقف المواعيد.",
  "190":
    "للمحكمة، ولو من تلقاء نفسها، أن تأمر بإدخال من ترى إدخاله لمصلحة العدالة أو لإظهار حقيقة، ومن ذلك:\n" +
    "1- من كان خصماً في الدعوى في مرحلة سابقة.\n" +
    "2- من تربطه بأحد الخصوم رابطة تضامن أو التزام لا يقبل التجزئة.\n" +
    "3- الوارث مع المدعي أو المدعى عليه أو الشريك على الشيوع إذا كانت الدعوى متعلقة بالتركة قبل قسمتها أو بعدها أو بالشيوع.\n" +
    "4- شركة التأمين المسئولة عن الحق المدعى به إذا كان مصرحاً بها.\n" +
    "5- من يحتمل أن يلحق به ضرر من قيام الدعوى أو من الحكم فيها إذا ظهرت للمحكمة دلائل جدية على التواطؤ أو الغش أو التقصير من جانب الخصوم.\n" +
    "وتعيّن المحكمة ميعاداً للخصوم لا يجاوز ثلاثة أسابيع.",
  "228":
    "1- يجب على المحكمة تحرير نسخة الحكم الأصلية والتوقيع عليها من قبل كاتبها وهيئة الحكم وختمها بعد المراجعة على المسودة، وذلك خلال مدة أقصاها ثلاثون يوماً من تاريخ النطق بالحكم.\n" +
    "2- بمجرد الانتهاء من ختم النسخة الأصلية للحكم بختم المحكمة يتم تسليم صورة معتمدة منها لكل خصم بعد توقيعهم على الاستلام في السجل الخاص بذلك، وإذا لم يحضر المحكوم عليه لاستلام نسخته بعد الانتهاء من كتابتها وجب إعلانه إعلاناً صحيحاً مصحوباً بنسخة الحكم وفقاً لقواعد الإعلان المقررة في القانون.\n" +
    "3- موت القاضي أو مرضه المقعِد لا يؤثر على صحة الحكم الذي وقّع على مسودته، فإذا كان قاضياً فرداً فتحرر نسخة الحكم الأصلية وتذيّل باسمه، وعلى خلفه أن يحرر أدنى ذلك ما يفيد صدور الحكم أعلاه عن سلفه ثم يوقّع على ما حرره ويختمه بختم المحكمة. أما إذا كان القاضي المتوفى أو المقعد عضواً ضمن هيئة فيتم توقيع نسخة الحكم من بقية أعضاء الهيئة شريطة ألا يقل عددهم عن الأغلبية المطلوبة، فإذا جاء الخلف لذلك العضو واكتمل تشكيل الهيئة فيُذكر أدنى ذلك سبب خلو الحكم من توقيع العضو، ويختم كل ذلك بتوقيع الهيئة الجديدة وختم المحكمة.",
  "242":
    "يكون الإعلان بواسطة محضر المحكمة إلى موطن المدعى عليه أو إلى مكان عمله أو إليه شخصياً في أي مكان يجده فيه، وإذا ثبت غش المحضر جاز للمحكمة حبسه شهراً والحكم عليه بالتعويض المناسب للخصم المتضرر أياً كان.",
  "269":
    "يبدأ ميعاد الاستئناف من تاريخ فوات ميعاد التظلم أو من تاريخ اعتبار التظلم كأن لم يكن، ويسقط الحق في التظلم من الأمر إذا طُعن فيه مباشرة بالاستئناف، ويكون الحكم الصادر في التظلم قابلاً للاستئناف.",
};

async function main() {
  const db = getDb();
  const law = db.prepare(`SELECT id FROM laws WHERE title = ?`).get(LAW_TITLE);
  if (!law) {
    console.error(`✗ لم يُعثر على القانون: ${LAW_TITLE}`);
    process.exit(1);
  }

  const rows = db
    .prepare(
      `SELECT id, article_number, content, ordering, amend_year, amend_status, amend_note
       FROM articles WHERE law_id = ? ORDER BY article_number, ordering, id`,
    )
    .all(law.id);

  // تجميع حسب رقم المادة
  const byNum = new Map();
  for (const r of rows) {
    const n = r.article_number ?? `__null_${r.id}`;
    if (!byNum.has(n)) byNum.set(n, []);
    byNum.get(n).push(r);
  }

  // نخطّط أولاً، ثم نُعيد تضمين النصوص الخمسة دفعةً واحدة
  const plan = []; // { primaryId, content, amendedText, amendYear, amendNote, reembed, deleteIds }
  const whollyNew = []; // مواد مُضافة بالكامل بعد 2014 (لا أصل لها) — تُترك كما هي
  for (const [num, group] of byNum) {
    const post = group.filter((r) => r.amend_status === "unrecognized");
    if (post.length === 0) continue;
    const amended = post.slice().sort((a, b) => (b.amend_year ?? 0) - (a.amend_year ?? 0))[0];
    const recognized = group.filter((r) => r.amend_status !== "unrecognized");

    let primary, content, reembed;
    if (recognized.length > 0) {
      // أحدث صفّ معترف به (أعلى سنة تعديل، ثم آخر ترتيب)
      primary = recognized
        .slice()
        .sort((a, b) => (b.amend_year ?? 0) - (a.amend_year ?? 0) || b.ordering - a.ordering)[0];
      content = primary.content;
      reembed = false;
    } else if (PDF_ORIGINALS[num]) {
      primary = amended;
      content = PDF_ORIGINALS[num];
      reembed = true;
    } else {
      // مادة مُضافة بالكامل بعد 2014 (لا نسخة قبل 2014) — نتركها موسومة كما هي
      whollyNew.push(num);
      continue;
    }

    const deleteIds = group.filter((r) => r.id !== primary.id).map((r) => r.id);
    plan.push({
      num,
      primaryId: primary.id,
      content,
      amendedText: amended.content,
      amendYear: amended.amend_year,
      amendNote: amended.amend_note,
      reembed,
      deleteIds,
    });
  }

  console.log(`• القانون: ${LAW_TITLE} (id=${law.id})`);
  console.log(`• مواد معدَّلة بعد 2014 (دُمجت): ${plan.length}`);
  if (whollyNew.length > 0)
    console.log(`• مواد مُضافة بالكامل بعد 2014 (تُركت موسومة): ${whollyNew.length} → [${whollyNew.join(", ")}]`);
  const reembedItems = plan.filter((p) => p.reembed);
  console.log(`• تحتاج إعادة تضمين (من PDF): ${reembedItems.length} → [${reembedItems.map((p) => p.num).join(", ")}]`);

  // إعادة تضمين النصوص الخمسة
  const newEmb = new Map();
  if (reembedItems.length > 0) {
    const vecs = await embedBatch(reembedItems.map((p) => p.content), "passage");
    reembedItems.forEach((p, i) => newEmb.set(p.primaryId, vecs[i]));
  }

  // ملاحظة: لا نلمس articles_fts هنا (جدول contentless، ومسار الإنتاج = الحزمة الثابتة
  // التي تُصدَّر من جدول articles مباشرةً عبر export-bundle). FTS مستخدم فقط في خادم التطوير.
  const updPrimary = db.prepare(
    `UPDATE articles SET content = ?, amended_text = ?, amend_year = ?, amend_status = 'unrecognized', amend_note = ? WHERE id = ?`,
  );
  const updEmb = db.prepare(`UPDATE articles SET embedding = ? WHERE id = ?`);
  const delArt = db.prepare(`DELETE FROM articles WHERE id = ?`);

  const tx = db.transaction(() => {
    for (const p of plan) {
      updPrimary.run(p.content, p.amendedText, p.amendYear, p.amendNote, p.primaryId);
      if (p.reembed) {
        updEmb.run(vectorToBlob(newEmb.get(p.primaryId)), p.primaryId);
      }
      for (const id of p.deleteIds) {
        delArt.run(id);
      }
    }
  });
  tx();

  const deleted = plan.reduce((s, p) => s + p.deleteIds.length, 0);
  console.log(`✓ حُدِّثت ${plan.length} مادة | حُذف ${deleted} صفّاً مكرراً | أُعيد تضمين ${reembedItems.length}.`);
}

main();
