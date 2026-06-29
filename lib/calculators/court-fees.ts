// حاسبة الرسوم القضائية النسبية
// المصدر: المادة (5) من قانون الرسوم القضائية رقم (26) لسنة 2013م.
// شرائح تصاعدية (هامشية): كل نسبة تُطبَّق على الجزء من قيمة الدعوى الواقع ضمن شريحتها.

export interface FeeBracket {
  // الحدّ الأعلى للشريحة بالريال (null = ما زاد عن السابق)
  upTo: number | null;
  // النسبة (مثلاً 0.015 = 1.5٪)
  rate: number;
}

export interface FeeSchedule {
  key: "recognized" | "sanaa2022";
  label: string;
  recognized: boolean;
  note: string;
  minFee: number;
  brackets: FeeBracket[];
  // سقف أقصى للرسم (يطبَّق في صيغة صنعاء على الدعاوى المدنية)
  maxFee: number | null;
}

// الصيغة الأصلية المعترف بها (قانون 26 لسنة 2013)
export const RECOGNIZED_SCHEDULE: FeeSchedule = {
  key: "recognized",
  label: "الصيغة الأصلية المعترف بها (قانون 26 لسنة 2013)",
  recognized: true,
  note: "النص الأصلي لقانون الرسوم القضائية رقم (26) لسنة 2013م.",
  minFee: 5000,
  maxFee: null,
  brackets: [
    { upTo: 10_000_000, rate: 0.015 }, // 1.5٪
    { upTo: 100_000_000, rate: 0.01 }, // 1٪
    { upTo: 200_000_000, rate: 0.0075 }, // 0.75٪
    { upTo: 300_000_000, rate: 0.005 }, // 0.5٪
    { upTo: null, rate: 0.0025 }, // 0.25٪
  ],
};

// الصيغة المعدّلة في صنعاء 2022 — غير معترف بها (بعد 2014)
export const SANAA_2022_SCHEDULE: FeeSchedule = {
  key: "sanaa2022",
  label: "صيغة صنعاء 2022 — غير معترف بها",
  recognized: false,
  note: "المادة (5) بصيغتها المعدلة بموجب القانون رقم (3) لسنة 2022م الصادر في صنعاء — تعديل بعد 2014 غير معترف به.",
  minFee: 5000,
  maxFee: 200_000, // سقف الرسم في الدعاوى المدنية
  brackets: [
    { upTo: 10_000_000, rate: 0.01 }, // 1٪
    { upTo: 100_000_000, rate: 0.005 }, // 0.5٪
    { upTo: 200_000_000, rate: 0.0025 }, // 0.25٪
    { upTo: null, rate: 0.001 }, // 0.10٪
  ],
};

export const FEE_SCHEDULES: FeeSchedule[] = [
  RECOGNIZED_SCHEDULE,
  SANAA_2022_SCHEDULE,
];

export interface FeeBreakdownRow {
  from: number;
  to: number | null;
  rate: number;
  amount: number; // الجزء من القيمة الواقع في هذه الشريحة
  fee: number; // الرسم على هذا الجزء
}

export interface FeeResult {
  claimValue: number;
  rawFee: number; // مجموع الرسوم قبل الحدّ الأدنى/الأقصى
  fee: number; // الرسم النهائي بعد تطبيق الحدّ الأدنى والأقصى
  minApplied: boolean;
  maxApplied: boolean;
  rows: FeeBreakdownRow[];
  schedule: FeeSchedule;
}

// يحسب الرسم النسبي على شرائح هامشية
export function computeCourtFee(
  claimValue: number,
  schedule: FeeSchedule,
): FeeResult {
  const value = Math.max(0, Math.floor(claimValue || 0));
  const rows: FeeBreakdownRow[] = [];
  let lower = 0;
  let rawFee = 0;

  for (const b of schedule.brackets) {
    const upper = b.upTo ?? Infinity;
    if (value <= lower) break;
    const portion = Math.min(value, upper) - lower;
    if (portion > 0) {
      const fee = portion * b.rate;
      rawFee += fee;
      rows.push({
        from: lower,
        to: b.upTo,
        rate: b.rate,
        amount: portion,
        fee,
      });
    }
    lower = upper;
  }

  let fee = rawFee;
  let minApplied = false;
  let maxApplied = false;

  if (value > 0 && fee < schedule.minFee) {
    fee = schedule.minFee;
    minApplied = true;
  }
  if (schedule.maxFee != null && fee > schedule.maxFee) {
    fee = schedule.maxFee;
    maxApplied = true;
  }

  return {
    claimValue: value,
    rawFee,
    fee: Math.round(fee),
    minApplied,
    maxApplied,
    rows,
    schedule,
  };
}

// تنسيق المبالغ بالريال اليمني
export function formatYER(n: number): string {
  return new Intl.NumberFormat("ar-YE", { maximumFractionDigits: 0 }).format(
    Math.round(n),
  );
}
