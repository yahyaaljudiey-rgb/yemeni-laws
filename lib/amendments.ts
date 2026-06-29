// كشف تعديلات المواد القانونية المضمّنة داخل أقواس ثلاثية: ((( ... )))
// مثال: "((( الفقرة (ج) بصيغتها المُعدلة بموجب القانون رقم (16) لسنة 2009م )))"
//
// التعديلات المؤرّخة بعد 2014 تُعدّ "غير معترف بها" (السياق السياسي اليمني).

// أي تعديل مؤرّخ بعد هذه السنة يُعتبر غير معترف به
export const RECOGNITION_CUTOFF_YEAR = 2014;

export type AmendStatus = "recognized" | "unrecognized";

export interface AmendmentInfo {
  // كل ملاحظات التعديل المستخرجة من النص (نص داخل الأقواس الثلاثية)
  notes: string[];
  // كل السنوات المذكورة داخل ملاحظات التعديل
  years: number[];
  // أحدث سنة تعديل (أو null)
  latestYear: number | null;
  // الحالة بناءً على أحدث سنة (أو null إن لا تعديل)
  status: AmendStatus | null;
}

// نطابق ثلاثة أقواس أو أكثر … حتى ثلاثة أقواس إغلاق أو أكثر (غير جشع)
const TRIPLE_PAREN = /\({3,}([\s\S]+?)\){3,}/g;
const YEAR = /(?:19|20)\d{2}/g;

export function extractAmendments(text: string): AmendmentInfo {
  const notes: string[] = [];
  const years: number[] = [];

  for (const m of text.matchAll(TRIPLE_PAREN)) {
    const inner = m[1].replace(/\s+/g, " ").trim();
    if (inner) notes.push(inner);
    for (const y of inner.matchAll(YEAR)) years.push(Number(y[0]));
  }

  const latestYear = years.length ? Math.max(...years) : null;
  const status: AmendStatus | null =
    latestYear == null
      ? null
      : latestYear > RECOGNITION_CUTOFF_YEAR
        ? "unrecognized"
        : "recognized";

  return { notes, years, latestYear, status };
}

// تقسيم نص المادة إلى أجزاء عادية وأجزاء تعديل (للعرض الملوّن في الواجهة)
export interface TextSegment {
  text: string;
  amendment: boolean;
}

export function segmentAmendments(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let last = 0;
  const re = new RegExp(TRIPLE_PAREN.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segments.push({ text: text.slice(last, m.index), amendment: false });
    segments.push({ text: m[1].replace(/\s+/g, " ").trim(), amendment: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), amendment: false });
  return segments;
}
