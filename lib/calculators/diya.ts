// حاسبة الديات والأروش — وفق جدول قرار رئيس مجلس القضاء الأعلى رقم (51) لسنة 2024م
// (تعديل المادة 40 من قانون الجرائم والعقوبات). القيم مأخوذة حرفياً من الجدول.
//
// لكل جناية مبلغٌ يعتمد على بُعدين:
//   - الجنس: رجل / امرأة
//   - نوع الجناية: «عمد وشبه العمد» / «خطأ»
// قاعدة القانون المضمَّنة في الأرقام: دية المرأة نصف الرجل، وأرشها كأرشه حتى يبلغ
// ثُلث الدية، فما زاد على الثلث يُنصَّف — لذا تُساوي المرأةُ الرجلَ في الإصابات
// حتى الثلث (33.33%) وتُنصَّف فيما فوقه (ذهاب النفس). الجدول يعطي القيم النهائية مباشرةً.

export type DiyaGender = "male" | "female";
export type DiyaIntent = "amd" | "khata"; // عمد وشبه العمد | خطأ

export interface DiyaInjury {
  key: string;
  name: string;
  percent: number; // النسبة من الدية الكاملة (للعرض)
  fractionLabel: string; // وصف النسبة كما في الجدول
  fiqh?: string; // التعريف الفقهي
  amounts: {
    male: { amd: number; khata: number };
    female: { amd: number; khata: number };
  };
}

// الدية الكاملة (المرجع): رجل عمد/شبه 30م، رجل خطأ 6م، امرأة 15م/3م.
export const FULL_DIYA = {
  male: { amd: 30_000_000, khata: 6_000_000 },
  female: { amd: 15_000_000, khata: 3_000_000 },
};

export const DIYA_INJURIES: DiyaInjury[] = [
  {
    key: "nafs",
    name: "ذهاب النفس (القتل)",
    percent: 100,
    fractionLabel: "الدية كاملة 100%",
    fiqh: "إزهاق الروح؛ تجب فيه الدية الكاملة.",
    amounts: { male: { amd: 30_000_000, khata: 6_000_000 }, female: { amd: 15_000_000, khata: 3_000_000 } },
  },
  {
    key: "diya-full",
    name: "حالات الديّة الكاملة (فقد عضو كامل الدية)",
    percent: 100,
    fractionLabel: "الدية كاملة 100%",
    fiqh: "ما تجب فيه الدية كاملة من فقد الأعضاء (كالعينين واليدين والرجلين واللسان والعقل…).",
    amounts: { male: { amd: 30_000_000, khata: 6_000_000 }, female: { amd: 15_000_000, khata: 3_000_000 } },
  },
  {
    key: "damigha",
    name: "الدامغة والآمة والجائفة",
    percent: 33.33,
    fractionLabel: "ثُلث الدية 33.33%",
    fiqh: "الدامغة والآمة: كسر عظم الجمجمة الواصل إلى أم الدماغ. والجائفة: الجرح النافذ إلى الجوف.",
    amounts: { male: { amd: 10_000_000, khata: 2_000_000 }, female: { amd: 10_000_000, khata: 2_000_000 } },
  },
  {
    key: "naqila",
    name: "الناقلة",
    percent: 15,
    fractionLabel: "ثلاثة أرباع خُمس الدية 15%",
    fiqh: "التي تكسر العظم أو تنقله من مكانه جزئياً أو كلياً.",
    amounts: { male: { amd: 4_500_000, khata: 900_000 }, female: { amd: 4_500_000, khata: 900_000 } },
  },
  {
    key: "hashima",
    name: "الهاشمة",
    percent: 10,
    fractionLabel: "عُشر الدية 10%",
    fiqh: "التي تهشم العظم دون نقله من مكانه.",
    amounts: { male: { amd: 3_000_000, khata: 600_000 }, female: { amd: 3_000_000, khata: 600_000 } },
  },
  {
    key: "mudiha",
    name: "الموضحة",
    percent: 5,
    fractionLabel: "نصف عشر الدية 5%",
    fiqh: "التي أوضحت العظم دون كسره. ومثلها أرش السنّ إذا كُسرت من أصلها.",
    amounts: { male: { amd: 1_500_000, khata: 300_000 }, female: { amd: 1_500_000, khata: 300_000 } },
  },
  {
    key: "simhaq",
    name: "السِّمحاق",
    percent: 4,
    fractionLabel: "خُمسا عشر الدية 4%",
    fiqh: "التي وصلت إلى القشرة الرقيقة المغطية للعظم ولم تصل إلى العظم.",
    amounts: { male: { amd: 1_200_000, khata: 240_000 }, female: { amd: 1_200_000, khata: 240_000 } },
  },
  {
    key: "mutalahima",
    name: "المتلاحمة",
    percent: 3,
    fractionLabel: "خمس ونصف خمس عشر الدية 3%",
    fiqh: "التي قطعت الجلد وغاصت في أكثر اللحم إلى نحو الثُّلثين.",
    amounts: { male: { amd: 900_000, khata: 180_000 }, female: { amd: 900_000, khata: 180_000 } },
  },
  {
    key: "badia",
    name: "الباضعة",
    percent: 2,
    fractionLabel: "خُمس عشر الدية 2%",
    fiqh: "التي قطعت الجلد وغاصت في اللحم إلى النصف فما دون.",
    amounts: { male: { amd: 600_000, khata: 120_000 }, female: { amd: 600_000, khata: 120_000 } },
  },
  {
    key: "damiya-kubra",
    name: "الدامية الكبرى",
    percent: 1.25,
    fractionLabel: "ثُمن عشر الدية 1.25%",
    fiqh: "التي شقت الجلد أو قطعته وسال الدم منها ولم تصل إلى اللحم.",
    amounts: { male: { amd: 375_000, khata: 75_000 }, female: { amd: 375_000, khata: 75_000 } },
  },
  {
    key: "damiya-sughra",
    name: "الدامية الصغرى",
    percent: 0.625,
    fractionLabel: "نصف ثمن عشر الدية 0.625%",
    fiqh: "التي شقت الجلد أو قطعت فيه قطعاً بسيطاً ولم يسل الدم منها بل التحم على محل الإصابة.",
    amounts: { male: { amd: 187_500, khata: 37_500 }, female: { amd: 187_500, khata: 37_500 } },
  },
  {
    key: "warima",
    name: "الوارمة والخارصة والقارشة",
    percent: 0.5,
    fractionLabel: "نصف عشر العشر 0.5%",
    fiqh: "الوارمة: يتورّم فيها مكان الإصابة. والخارصة/القارشة: قرش الجلد دون ظهور دم.",
    amounts: { male: { amd: 150_000, khata: 30_000 }, female: { amd: 150_000, khata: 30_000 } },
  },
  {
    key: "muhammira",
    name: "المحمرة والمخضرة والمسودة",
    percent: 0.4,
    fractionLabel: "خُمسا عشر العشر 0.4%",
    fiqh: "التي يحمرّ أو يخضرّ أو يسودّ فيها مكان الإصابة.",
    amounts: { male: { amd: 120_000, khata: 24_000 }, female: { amd: 120_000, khata: 24_000 } },
  },
];

// مبلغ جناية واحدة (للجنس ونوع الجناية) مضروباً في العدد
export function diyaAmount(
  injury: DiyaInjury,
  gender: DiyaGender,
  intent: DiyaIntent,
  count = 1,
): number {
  return injury.amounts[gender][intent] * Math.max(0, count);
}

// الأعضاء التي تجب في فقدها الدية كاملة (تنبيه الجدول رقم 3)
export const FULL_DIYA_ORGANS =
  "الأنف، اللسان، الذكر، العقل، الصلب، القول، الصوت، البول، النسل، حاجز الأنف، " +
  "العينان، الأذنان، الرجلان، اليدان، الشفتان، الثديان (وحلمتاهما للمرأة)، الثنيان، " +
  "الحاجبان، الجفنان، أصابع اليدين، أصابع القدمين، الأسنان — وتنقص الدية بنسبة ما بقي من الأعضاء التي من جنس واحد.";
