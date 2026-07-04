// المستشار الذكي الأوفلايني: يفهم نيّة السؤال ويجيب مباشرةً ومؤصَّلاً
// دون إنترنت ولا نموذج لغة — بربط بيانات القوانين بالحاسبات (ديات/رسوم/مواعيد).
// أي سؤال خارج النوايا المعروفة → بحث في المواد مع الاستشهاد.

import {
  clientSearch,
  normalizeAr,
  type ClientHit,
} from "./client-search";
import { DIYA_INJURIES, FULL_DIYA, type DiyaInjury } from "./calculators/diya";
import {
  ADEN_2025_SCHEDULE,
  FIXED_FEES,
  computeCourtFee,
  formatYER,
} from "./calculators/court-fees";
import { DEADLINE_RULES } from "./calculators/deadlines";
import {
  EMPTY_HEIRS,
  computeInheritance,
  fracToPercent,
  fracToString,
  type Heirs,
} from "./calculators/inheritance";

export type AssistantKind = "diya" | "fee" | "deadline" | "inheritance" | "search";

export interface AssistantResult {
  kind: AssistantKind;
  title: string;
  lines: string[]; // أسطر الإجابة المؤصَّلة
  citation?: string;
  hits: ClientHit[]; // مواد للاستشهاد/التوسّع
}

const N = (s: string) => normalizeAr(s);
function toLatin(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

// كلمات مفتاحية لكل جناية دية (مطبّعة عند الاستخدام)
const DIYA_KEYS: Record<string, string[]> = {
  nafs: ["ذهاب النفس", "القتل", "الدية الكاملة", "دية كاملة"],
  damigha: ["الدامغة", "الآمة", "الجائفة"],
  naqila: ["الناقلة"],
  hashima: ["الهاشمة"],
  mudiha: ["الموضحة"],
  simhaq: ["السمحاق"],
  mutalahima: ["المتلاحمة"],
  badia: ["الباضعة"],
  "damiya-kubra": ["الدامية الكبرى", "الكبرى"],
  "damiya-sughra": ["الدامية الصغرى", "الصغرى"],
  warima: ["الوارمة", "الخارصة", "القارشة"],
  muhammira: ["المحمرة", "المخضرة", "المسودة"],
};

function matchDiya(qn: string): DiyaInjury | null {
  for (const inj of DIYA_INJURIES) {
    const keys = DIYA_KEYS[inj.key];
    if (keys && keys.some((k) => qn.includes(N(k)))) return inj;
  }
  return null;
}

// تحليل مبلغ من نصّ عربي: أرقام + «مليون»/«ألف»
function parseAmount(q: string): number | null {
  const s = toLatin(q).replace(/[،,]/g, "");
  const m = s.match(/(\d+(?:\.\d+)?)\s*(مليون|ملايين|مليار|الف|آلاف|ألف)?/);
  if (!m) return null;
  let v = parseFloat(m[1]);
  const unit = m[2] || "";
  if (/مليار/.test(unit)) v *= 1_000_000_000;
  else if (/مليون|ملايين/.test(unit)) v *= 1_000_000;
  else if (/الف|آلاف|ألف/.test(unit)) v *= 1_000;
  return Math.round(v);
}

function parseEstateAmount(q: string): number | null {
  const s = toLatin(q).replace(/[،,]/g, "");
  const values = [...s.matchAll(/(\d+(?:\.\d+)?)\s*(مليار|مليون|ملايين|الف|آلاف|ألف|ريال)/g)]
    .map((m) => {
      let value = Number(m[1]);
      if (/مليار/.test(m[2])) value *= 1_000_000_000;
      else if (/مليون|ملايين/.test(m[2])) value *= 1_000_000;
      else if (/الف|آلاف|ألف/.test(m[2])) value *= 1_000;
      return Math.round(value);
    });
  return values.length ? Math.max(...values) : null;
}

function mentionedCount(qn: string, names: string[], fallback = 1): number {
  const s = toLatin(qn);
  for (const name of names.map(N)) {
    const after = s.match(new RegExp(`${name}\\s*(\\d+)`));
    if (after) return Number(after[1]);
    const before = s.match(new RegExp(`(\\d+)\\s*${name}`));
    if (before) return Number(before[1]);
    if (s.includes(name)) return fallback;
  }
  return 0;
}

function parseHeirs(qn: string): Heirs {
  qn = qn.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  const heirs: Heirs = { ...EMPTY_HEIRS };
  heirs.husband = /(^|\s)زوج(\s|$)/.test(qn);
  heirs.wives = mentionedCount(qn, ["زوجة", "زوجات"], /زوجتان|زوجتين/.test(qn) ? 2 : 1);
  heirs.father = /(^|\s)(اب|والد)(\s|$)/.test(qn);
  heirs.mother = /(^|\s)(ام|والدة)(\s|$)/.test(qn);
  heirs.grandfather = /جد/.test(qn) && !/جده|جدات/.test(qn);
  heirs.grandmother = mentionedCount(qn, ["جدة", "جدات"]);
  heirs.grandsons = mentionedCount(qn, ["ابن الابن", "ابناء الابن"]);
  heirs.granddaughters = mentionedCount(qn, ["بنت الابن", "بنات الابن"]);
  const directDescendants = qn
    .replace(/ابن الابن|ابناء الابن|بنت الابن|بنات الابن/g, " ")
    .replace(/\s+/g, " ");
  heirs.sons = mentionedCount(directDescendants, ["ابن", "ابناء", "بنين"], /ابنان|ابنين/.test(directDescendants) ? 2 : 1);
  heirs.daughters = mentionedCount(directDescendants, ["بنت", "بنات"], /بنتان|بنتين/.test(directDescendants) ? 2 : 1);
  heirs.fullBrothers = mentionedCount(qn, ["اخ شقيق", "اخوة اشقاء"]);
  heirs.fullSisters = mentionedCount(qn, ["اخت شقيقة", "اخوات شقيقات"]);
  heirs.paternalBrothers = mentionedCount(qn, ["اخ لاب", "اخوة لاب"]);
  heirs.paternalSisters = mentionedCount(qn, ["اخت لاب", "اخوات لاب"]);
  heirs.maternalSiblings = mentionedCount(qn, ["اخ لام", "اخت لام", "اخوة لام"]);
  return heirs;
}

async function withHits(query: string, limit = 6): Promise<ClientHit[]> {
  try {
    return (await clientSearch(query, limit)) as ClientHit[];
  } catch {
    return [];
  }
}

export async function assistantAnswer(query: string): Promise<AssistantResult> {
  const q = query.trim();
  const qn = N(q);

  // ————— 1) نيّة الديات —————
  // جناية بعينها، وإلا أي ذكر لـ«دية/أرش» → الدية الكاملة (ذهاب النفس) بنوعها المطلوب
  let injury = matchDiya(qn);
  if (!injury && /دي[هة]|ارش/.test(qn)) {
    injury = DIYA_INJURIES.find((i) => i.key === "nafs") ?? null;
  }
  if (injury) {
    const female = /مرا|انثي|نسا|زوج[هة]|بنت/.test(qn);
    const male = /رجل|ذكر/.test(qn);
    const genderSet = female || male;
    const khata = /خطا/.test(qn);
    const amd = /عمد|شبه/.test(qn);
    const g = female ? "female" : "male";
    const gLabel = female ? "المرأة" : "الرجل";
    const isFull = injury.percent === 100;
    const term = isFull ? "الدية" : "الأرش";
    const lines: string[] = [`النسبة: ${injury.fractionLabel}`];
    if (injury.fiqh) lines.push(`التعريف: ${injury.fiqh}`);
    if (khata && !amd) {
      lines.push(`${term} (${gLabel} — خطأ): ${formatYER(injury.amounts[g].khata)} ريال`);
    } else if (amd && !khata) {
      lines.push(`${term} (${gLabel} — عمد وشبه العمد): ${formatYER(injury.amounts[g].amd)} ريال`);
    } else if (genderSet) {
      lines.push(
        `${gLabel}: عمد/شبه ${formatYER(injury.amounts[g].amd)} · خطأ ${formatYER(injury.amounts[g].khata)}`,
      );
    } else {
      lines.push(
        `الرجل: عمد/شبه ${formatYER(injury.amounts.male.amd)} · خطأ ${formatYER(injury.amounts.male.khata)}`,
      );
      lines.push(
        `المرأة: عمد/شبه ${formatYER(injury.amounts.female.amd)} · خطأ ${formatYER(injury.amounts.female.khata)}`,
      );
    }
    return {
      kind: "diya",
      title: injury.name,
      lines,
      citation: "جدول الديات والأروش — قرار مجلس القضاء الأعلى رقم (51) لسنة 2024م",
      hits: await withHits(`${injury.name} دية أرش`, 4),
    };
  }

  // ————— 2) نيّة الرسوم —————
  if (/رسم|رسوم/.test(qn)) {
    const amount = parseAmount(q);
    if (amount && amount >= 1000) {
      const r = computeCourtFee(amount, ADEN_2025_SCHEDULE);
      const rate = (r.rows[0]?.rate ?? 0) * 100;
      return {
        kind: "fee",
        title: "الرسم القضائي (دعوى معلومة القيمة)",
        lines: [
          `قيمة الدعوى: ${formatYER(amount)} ريال`,
          `النسبة المطبَّقة: ${rate}٪ (حسب شريحة المبلغ)`,
          `الرسم المستحق: ${formatYER(r.fee)} ريال`,
          `يُدفع عند الرفع 80٪ = ${formatYER(Math.round(r.fee * 0.8))} ريال، والباقي عند الحكم.`,
        ],
        citation: "المادة (5) — قرار رئيس مجلس القضاء الأعلى رقم (41) لسنة 2025م (عدن)",
        hits: [],
      };
    }
    // رسم ثابت حسب النوع — نختار الأعلى تداخلاً بالكلمات المميّزة
    const words = (s: string) =>
      N(s).split(/[\s()،.\/]+/).filter((w) => w.length >= 3);
    let ff: (typeof FIXED_FEES)[number] | null = null;
    let bestScore = 0;
    for (const f of FIXED_FEES) {
      const score = words(f.label).filter((w) => qn.includes(w)).length;
      if (score > bestScore) {
        bestScore = score;
        ff = f;
      }
    }
    if (ff && bestScore >= 1) {
      return {
        kind: "fee",
        title: ff.label,
        lines: [
          `الرسم: ${formatYER(ff.amount)} ريال${ff.perUnit ? ` (${ff.perUnit})` : ""}`,
        ],
        citation: `${ff.article} — قرار عدن رقم (41) لسنة 2025م`,
        hits: [],
      };
    }
  }

  // ————— 3) نيّة المواريث —————
  if (/ميراث|تركه|ورث|ورثه|فرائض/.test(qn)) {
    const heirs = parseHeirs(qn);
    const anyHeir = Object.values(heirs).some((value) => value === true || (typeof value === "number" && value > 0));
    if (!anyHeir) {
      return {
        kind: "inheritance",
        title: "حساب الميراث",
        lines: ["اذكر قيمة التركة والورثة الموجودين وعدد كل فئة، مثل: توفي عن زوجة وأم وابنين وبنت وترك 30 مليون ريال."],
        citation: "حاسبة المواريث — قانون الأحوال الشخصية اليمني رقم (20) لسنة 1992م وأصول الفرائض",
        hits: await withHits("الميراث أنصبة الورثة", 4),
      };
    }
    const result = computeInheritance(heirs);
    const estate = parseEstateAmount(q);
    const lines = result.allocations.map((allocation) => {
      const share = `${fracToString(allocation.share)} (${fracToPercent(allocation.share)})`;
      const amount = estate ? ` = ${formatYER(estate * allocation.share.n / allocation.share.d)} ريال` : "";
      const perHead = allocation.count > 1
        ? `؛ للفرد ${fracToString(allocation.perHead)}${estate ? ` = ${formatYER(estate * allocation.perHead.n / allocation.perHead.d)} ريال` : ""}`
        : "";
      return `${allocation.label}: ${share}${amount}${perHead} — ${allocation.reason}`;
    });
    if (result.blocked.length) {
      lines.push(`المحجوبون: ${result.blocked.map((b) => `${b.label} بـ${b.by}`).join("، ")}`);
    }
    lines.push(...result.notes);
    return {
      kind: "inheritance",
      title: estate ? `تقسيم تركة قدرها ${formatYER(estate)} ريال يمني` : "أنصبة الورثة",
      lines,
      citation: "حاسبة المواريث — قانون الأحوال الشخصية اليمني رقم (20) لسنة 1992م وأصول الفرائض",
      hits: await withHits("الميراث أنصبة الورثة", 4),
    };
  }

  // ————— 4) نيّة المواعيد —————
  if (/ميعاد|مهل[هة]|المد[هة]|متى|مواعيد/.test(qn)) {
    const rule = DEADLINE_RULES.find((d) => {
      const kws = N(d.label).split(/[\s()—/]+/).filter((w) => w.length >= 3);
      return kws.some((w) => qn.includes(w));
    });
    if (rule) {
      return {
        kind: "deadline",
        title: rule.label,
        lines: [
          `المدة: ${rule.days} يوماً`,
          `بدء الاحتساب: ${rule.startLabel}`,
          ...(rule.note ? [rule.note] : []),
        ],
        citation: `${rule.basisArticle} — قانون المرافعات والتنفيذ المدني`,
        hits: await withHits(rule.label, 3),
      };
    }
  }

  // ————— 5) الافتراضي: بحث لفظيّ ذكيّ مؤصَّل (الفهم الحرّ عبر Gemini/Claude) —————
  const hits = await withHits(q, 10);
  return {
    kind: "search",
    title: "أقرب المواد لسؤالك",
    lines:
      hits.length === 0
        ? ["لم أجد مواد مطابقة. جرّب صياغة أخرى أو كلمات مفتاحية."]
        : [],
    hits,
  };
}

// ملخّص «معرفة التطبيق» — يُمرَّر لنموذج المحادثة (Gemini/Claude) ليعرف كل بيانات
// التطبيق وحاسباته ونطاقه، فيجيب عن الديات والرسوم والمواعيد والدستور بثقة.
export function appKnowledge(): string {
  const diya = DIYA_INJURIES.map(
    (i) =>
      `- ${i.name} (${i.fractionLabel}): رجل عمد/شبه ${formatYER(i.amounts.male.amd)} · خطأ ${formatYER(i.amounts.male.khata)}؛ امرأة عمد/شبه ${formatYER(i.amounts.female.amd)} · خطأ ${formatYER(i.amounts.female.khata)}`,
  ).join("\n");
  const fees = FIXED_FEES.map(
    (f) => `- ${f.label}: ${formatYER(f.amount)} ريال${f.perUnit ? ` (${f.perUnit})` : ""} [${f.article}]`,
  ).join("\n");
  const deadlines = DEADLINE_RULES.map(
    (d) => `- ${d.label}: ${d.days} يوماً [${d.basisArticle}]`,
  ).join("\n");
  return [
    "== معرفة التطبيق (بيانات موثوقة داخل التطبيق — استعِن بها مباشرةً) ==",
    "نطاق المحتوى المتاح للبحث: القوانين اليمنية، اللوائح التنظيمية، القواعد والأحكام القضائية، تعليمات النيابة العامة، والدستور (دستور الجمهورية اليمنية المعدّل 2001م). كلها موجودة ويمكن الاستشهاد بها — لا تقل إنها غير موجودة.",
    `\nالديات والأروش (قرار مجلس القضاء الأعلى 51/2024) — الدية الكاملة: الرجل ${formatYER(FULL_DIYA.male.amd)} (عمد/شبه) و${formatYER(FULL_DIYA.male.khata)} (خطأ)؛ المرأة ${formatYER(FULL_DIYA.female.amd)} و${formatYER(FULL_DIYA.female.khata)}. وبالريال اليمني بالتفصيل:\n${diya}`,
    `\nالرسوم القضائية (قرار عدن 41/2025): رسم نسبي على الدعاوى معلومة القيمة: 3٪ حتى 10 ملايين (بحدّ أدنى 20,000 ريال)، ثم 2٪ حتى 100 مليون، ثم 1.5٪ فيما زاد؛ ويُحصَّل 80٪ عند رفع الدعوى. ورسوم ثابتة:\n${fees}`,
    `\nالمواعيد الإجرائية (قانون المرافعات 40/2002):\n${deadlines}`,
  ].join("\n");
}
