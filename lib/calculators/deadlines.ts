// حاسبة المواعيد القانونية
// المصدر: قانون المرافعات والتنفيذ المدني رقم (40) لسنة 2002م.
// ملاحظة: المواعيد بالأيام التقويمية ما لم يُنص على خلافه؛ وقد تتأثر ببدء الاحتساب
// (من النطق بالحكم أو من تاريخ الإعلان) وبأيام العطل ومسافة الطريق.

export type StartBasis = "judgment" | "notification" | "event";

export interface DeadlineRule {
  key: string;
  label: string;
  days: number;
  basisArticle: string; // المادة المرجعية
  startBasis: StartBasis;
  startLabel: string; // وصف نقطة البدء
  note?: string;
  urgent?: boolean; // قضية مستعجلة تُنظر خلال العطلة القضائية (رمضان لا يوقفها)
}

export const DEADLINE_RULES: DeadlineRule[] = [
  {
    key: "appeal_general",
    label: "الطعن (استئناف/نقض) — القاعدة العامة",
    days: 60,
    basisArticle: "المادة (275)",
    startBasis: "notification",
    startLabel: "من تاريخ صدور الحكم أو إعلانه بحسب الأحوال",
    note: "ميعاد الطعن ستون يوماً ما لم ينص القانون على خلاف ذلك.",
  },
  {
    key: "urgent_appeal",
    label: "استئناف الأحكام المستعجلة",
    days: 8,
    basisArticle: "المادة (244)",
    startBasis: "judgment",
    startLabel: "من تاريخ النطق بالحكم",
    urgent: true,
  },
  {
    key: "execution_dispute",
    label: "الطعن في أحكام منازعات التنفيذ (أمام الاستئناف)",
    days: 15,
    basisArticle: "المادة (501)",
    startBasis: "judgment",
    startLabel: "من تاريخ صدور الحكم في المنازعة",
    urgent: true,
  },
  {
    key: "interlocutory",
    label: "الطعن في الأحكام غير المنهية للخصومة (وقف/عدم اختصاص/إحالة)",
    days: 15,
    basisArticle: "المادة (274)",
    startBasis: "judgment",
    startLabel: "من تاريخ صدور الحكم",
  },
  {
    key: "incidental_appeal",
    label: "الاستئناف الفرعي",
    days: 15,
    basisArticle: "المادة (286)",
    startBasis: "notification",
    startLabel: "من تاريخ إعلانه بالاستئناف الأصلي",
  },
  {
    key: "cassation_reply",
    label: "مذكرة المطعون ضده بالنقض",
    days: 15,
    basisArticle: "المادة (296)",
    startBasis: "notification",
    startLabel: "من تاريخ إعلانه بصحيفة الطعن",
  },
  {
    key: "objection_order_10",
    label: "التظلّم من الأمر على عريضة",
    days: 10,
    basisArticle: "المادة (251)",
    startBasis: "notification",
    startLabel: "من تاريخ الإعلان بالأمر أو رفض الطلب",
  },
  {
    key: "objection_payorder",
    label: "التظلّم من أمر الأداء",
    days: 8,
    basisArticle: "المادة (262)",
    startBasis: "notification",
    startLabel: "من تاريخ الإعلان بالأمر",
    urgent: true,
  },
  {
    key: "debtor_objection",
    label: "تظلّم المدين من أمر الحجز",
    days: 10,
    basisArticle: "المادة (268)",
    startBasis: "notification",
    startLabel: "من تاريخ الإعلان به",
    urgent: true,
  },
  {
    key: "settlement_objection",
    label: "الاعتراض على صحة اتفاق التسوية",
    days: 3,
    basisArticle: "المادة (479)",
    startBasis: "event",
    startLabel: "من تاريخ رفع التسوية إلى محكمة التنفيذ",
  },
];

export interface SkippedHoliday {
  date: Date;
  name: string;
}

export interface DeadlineResult {
  rule: DeadlineRule;
  start: Date;
  rawDeadline: Date; // الموعد قبل مراعاة العطل (تقويمي)
  deadline: Date; // الموعد بعد امتداد اليوم الأخير إن صادف عطلة
  extended: boolean;
  skippedHolidays: SkippedHoliday[]; // العطل التي أدّت للامتداد
  daysRemaining: number; // من اليوم حتى آخر موعد (سالب = انقضى)
  expired: boolean;
  isLastDay: boolean;
}

// يضيف عدد أيام إلى تاريخ (أيام تقويمية)
function addDays(d: Date, days: number): Date {
  const r = new Date(d.getTime());
  r.setDate(r.getDate() + days);
  return r;
}

// العطل الرسمية الميلادية الثابتة (المادة 3/أ من قانون العطل رقم 2 لسنة 2000م)
const FIXED_HOLIDAYS: { m: number; d: number; name: string }[] = [
  { m: 5, d: 1, name: "عيد العمال" },
  { m: 5, d: 22, name: "اليوم الوطني" },
  { m: 9, d: 26, name: "ثورة 26 سبتمبر" },
  { m: 10, d: 14, name: "ثورة 14 أكتوبر" },
  { m: 11, d: 30, name: "يوم الاستقلال" },
];

// التاريخ الهجري (تقويم أم القرى) لتاريخ ميلادي — {m: الشهر 1-12, d: اليوم}
function toHijri(d: Date): { m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-US-u-ca-islamic-umalqura", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).formatToParts(d);
  return {
    m: Number(parts.find((p) => p.type === "month")?.value),
    d: Number(parts.find((p) => p.type === "day")?.value),
  };
}

// اسم العطلة إن كان اليوم عطلة (نهاية أسبوع/رسمية/عيد/عطلة قضائية رمضان)، وإلا null.
// urgent = قضية مستعجلة: تُنظر خلال العطلة القضائية (م.73) فلا يوقفها رمضان،
// لكنها تظل تتأثّر بالجمعة/السبت والعطل الرسمية والأعياد.
// ملاحظة: العطل الهجرية تقريبية (أم القرى) وقد تختلف يوماً بحسب الرؤية.
export function holidayName(d: Date, urgent = false): string | null {
  const g = d.getDay();
  if (g === 5) return "الجمعة";
  if (g === 6) return "السبت";
  const fixed = FIXED_HOLIDAYS.find(
    (h) => h.m === d.getMonth() + 1 && h.d === d.getDate(),
  );
  if (fixed) return fixed.name;
  const h = toHijri(d);
  if (h.m === 10 && h.d <= 3) return "عيد الفطر";
  if (h.m === 12 && h.d >= 9 && h.d <= 13) return "عيد الأضحى";
  if (h.m === 1 && h.d === 1) return "رأس السنة الهجرية";
  // رمضان أحد شهرَي العطلة القضائية (م.73) — لا يوقف مواعيد القضايا المستعجلة
  if (h.m === 9 && !urgent) return "العطلة القضائية (رمضان)";
  return null;
}

// يمدّ التاريخ إلى أول يوم عمل تالٍ إن صادف عطلة (م.111: العطلات توقف المواعيد)
function nextWorkingDay(
  d: Date,
  urgent: boolean,
): { date: Date; skipped: SkippedHoliday[] } {
  const skipped: SkippedHoliday[] = [];
  let r = new Date(d.getTime());
  let name: string | null;
  let guard = 0;
  while ((name = holidayName(r, urgent)) !== null && guard < 45) {
    if (!skipped.some((s) => s.name === name)) {
      skipped.push({ date: new Date(r.getTime()), name });
    }
    r = addDays(r, 1);
    guard++;
  }
  return { date: r, skipped };
}

// يحسب الفرق بالأيام بين تاريخين (تقويمي، بتجاهل الوقت)
function diffDays(a: Date, b: Date): number {
  const da = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const db = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((da - db) / 86_400_000);
}

export function computeDeadline(
  rule: DeadlineRule,
  startDate: Date,
  today: Date = new Date(),
  urgent = false,
): DeadlineResult {
  // آخر يوم تقويمي = تاريخ البدء + المدة
  const rawDeadline = addDays(startDate, rule.days);
  // إن صادف اليوم الأخير عطلة (جمعة/سبت/رسمية/عيد/عطلة قضائية) يُمدّ لأول يوم عمل
  const { date: deadline, skipped } = nextWorkingDay(rawDeadline, urgent);
  const daysRemaining = diffDays(deadline, today);
  return {
    rule,
    start: startDate,
    rawDeadline,
    deadline,
    extended: skipped.length > 0,
    skippedHolidays: skipped,
    daysRemaining,
    expired: daysRemaining < 0,
    isLastDay: daysRemaining === 0,
  };
}

const AR_DAYS = [
  "الأحد",
  "الإثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
];

export function formatDateAr(d: Date): string {
  const day = AR_DAYS[d.getDay()];
  const date = new Intl.DateTimeFormat("ar", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(d);
  return `${day} ${date}`;
}
