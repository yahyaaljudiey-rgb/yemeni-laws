// مُحلّل النصوص القانونية العربية: يقسّم نص القانون إلى مواد منفصلة.

export interface ParsedArticle {
  article_number: string | null;
  heading: string | null;
  content: string;
}

// تحويل الأرقام العربية-الهندية (٠١٢…) إلى أرقام غربية (012…)
const AR_INDIC = "٠١٢٣٤٥٦٧٨٩";
function normalizeDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String(AR_INDIC.indexOf(d)));
}

// خريطة الأعداد الترتيبية الشائعة في صياغة القوانين
const ORDINALS: Record<string, string> = {
  "الأولى": "1", "الاولى": "1", "الثانية": "2", "الثالثة": "3",
  "الرابعة": "4", "الخامسة": "5", "السادسة": "6", "السابعة": "7",
  "الثامنة": "8", "التاسعة": "9", "العاشرة": "10",
};
const ORDINAL_ALT = Object.keys(ORDINALS).join("|");

// إصلاح آثار ترميز الخط في ملفات هذا المصدر (انعكاس ربط لام-ألف):
// "لا" تظهر كـ "ال". نُصلح الحالات الآمنة فقط (المعزولة وبداية الكلمة)،
// إذ لا توجد كلمة عربية صحيحة تبدأ بـ "اال" أو تكون "ال" منفصلة.
const AR_LETTER = "\\u0621-\\u064A\\u0671";
function fixLamAlef(s: string): string {
  return s
    // ألف مزدوجة في بداية الكلمة: "االستئناف" → "الاستئناف"، "االمتناع" → "الامتناع"
    .replace(new RegExp(`(^|[^${AR_LETTER}])اال`, "g"), "$1الا")
    // "ال" منفصلة (محاطة بغير حروف) → "لا": "ال يجوز" → "لا يجوز"
    .replace(new RegExp(`(^|[^${AR_LETTER}])ال(?![${AR_LETTER}])`, "g"), "$1لا");
}

// تنظيف عام للنص قبل التحليل
function cleanText(raw: string): string {
  return normalizeDigits(raw)
    .replace(/ـ/g, "") // حذف علامة التطويل (الكشيدة): "المـدة" → "المدة"
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => fixLamAlef(line))
    .join("\n")
    .trim();
}

// مكوّن الرقم: أرقام (مع "مكرر" اختياري) أو عدد ترتيبي
const NUM = String.raw`(\d+(?:[ ]?مكرر(?:ًا|اً|ا)?)?|${ORDINAL_ALT})`;

// الصيغة (أ): مُغلَّفة بقوسين مثل "(المادة40)" — تنسيق مكتبة القاضي صالح سيف.
// القوس قبل كلمة "المادة" يميّز الرؤوس عن الإحالات داخل النص مثل "المادة (40)".
function buildWrappedRegex(): RegExp {
  return new RegExp(
    String.raw`\(\s*(?:ال)?ماد[ةه]\s*` + NUM + String.raw`\s*\)\s*[:\-–.]?`,
    "g",
  );
}

// الصيغة (ب): عامة في بداية السطر — "مادة (N)" / "المادة رقم N" / "المادة الأولى".
function buildLineStartRegex(): RegExp {
  return new RegExp(
    String.raw`(?:^|\n)[ \t]*\(?[ \t]*(?:ال)?ماد[ةه][ \t]*(?:رقم[ \t]*)?\(?[ \t]*` +
      NUM +
      String.raw`[ \t]*\)?\s*[:\-–.]?`,
    "g",
  );
}

function normalizeArticleNumber(captured: string): string {
  const trimmed = captured.trim();
  if (ORDINALS[trimmed]) return ORDINALS[trimmed];
  return trimmed;
}

// التحليل الرئيسي: يُعيد قائمة المواد. إن لم يجد أي علامة "مادة"
// يُعيد النص كاملاً كقطعة واحدة حتى يبقى البحث الدلالي ممكناً.
function collectMatches(text: string, re: RegExp) {
  const matches: { number: string; start: number; contentStart: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    matches.push({
      number: normalizeArticleNumber(m[1]),
      start: m.index,
      contentStart: m.index + m[0].length,
    });
  }
  return matches;
}

export function parseArticles(rawText: string): ParsedArticle[] {
  const text = cleanText(rawText);
  if (!text) return [];

  // نُجرّب الصيغة المُغلَّفة أولاً (الأكثر دقة)، فإن لم تكفِ نلجأ للصيغة العامة.
  let matches = collectMatches(text, buildWrappedRegex());
  if (matches.length < 3) {
    const lineStart = collectMatches(text, buildLineStartRegex());
    if (lineStart.length > matches.length) matches = lineStart;
  }

  if (matches.length === 0) {
    return [
      { article_number: null, heading: "النص الكامل", content: text },
    ];
  }

  const articles: ParsedArticle[] = [];
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const next = matches[i + 1];
    const end = next ? next.start : text.length;
    const body = text.slice(cur.contentStart, end).trim();
    if (!body) continue;
    articles.push({
      article_number: cur.number,
      heading: `المادة (${cur.number})`,
      content: body,
    });
  }

  return articles;
}
