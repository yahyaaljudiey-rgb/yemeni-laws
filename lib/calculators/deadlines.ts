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
  },
  {
    key: "execution_dispute",
    label: "الطعن في أحكام منازعات التنفيذ (أمام الاستئناف)",
    days: 15,
    basisArticle: "المادة (501)",
    startBasis: "judgment",
    startLabel: "من تاريخ صدور الحكم في المنازعة",
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
  },
  {
    key: "debtor_objection",
    label: "تظلّم المدين من أمر الحجز",
    days: 10,
    basisArticle: "المادة (268)",
    startBasis: "notification",
    startLabel: "من تاريخ الإعلان به",
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

export interface DeadlineResult {
  rule: DeadlineRule;
  start: Date;
  deadline: Date;
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
): DeadlineResult {
  // آخر يوم يجوز فيه الإجراء = تاريخ البدء + المدة
  const deadline = addDays(startDate, rule.days);
  const daysRemaining = diffDays(deadline, today);
  return {
    rule,
    start: startDate,
    deadline,
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
