"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  FEE_SCHEDULES,
  computeCourtFee,
  formatYER,
  type FeeSchedule,
} from "@/lib/calculators/court-fees";
import {
  DEADLINE_RULES,
  computeDeadline,
  formatDateAr,
  type DeadlineRule,
} from "@/lib/calculators/deadlines";
import {
  EMPTY_HEIRS,
  computeInheritance,
  fracToString,
  fracToPercent,
  type Heirs,
  type Frac,
} from "@/lib/calculators/inheritance";

type Tool = "fees" | "deadlines" | "inheritance";

export default function ToolsPage() {
  const [tool, setTool] = useState<Tool>("fees");

  return (
    <div className="flex flex-col min-h-full">
      <header className="border-b border-border bg-surface">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-primary tracking-tight">
              الحاسبات القانونية
            </h1>
            <p className="text-xs sm:text-sm text-muted mt-1">
              أدوات حسابية مبنية على نصوص القوانين اليمنية
            </p>
          </div>
          <Link
            href="/"
            className="text-sm px-3 py-2 rounded-lg border border-border hover:border-primary hover:text-primary transition-colors whitespace-nowrap"
          >
            ← الرئيسية
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6">
        <div className="inline-flex flex-wrap rounded-xl border border-border bg-surface p-1 mb-5 gap-1">
          <TabButton active={tool === "fees"} onClick={() => setTool("fees")}>
            الرسوم القضائية
          </TabButton>
          <TabButton
            active={tool === "deadlines"}
            onClick={() => setTool("deadlines")}
          >
            المواعيد
          </TabButton>
          <TabButton
            active={tool === "inheritance"}
            onClick={() => setTool("inheritance")}
          >
            المواريث
          </TabButton>
        </div>

        {tool === "fees" && <CourtFeesCalculator />}
        {tool === "deadlines" && <DeadlinesCalculator />}
        {tool === "inheritance" && <InheritanceCalculator />}
      </main>

      <footer className="border-t border-border text-center text-xs text-muted py-4">
        النتائج استرشادية؛ المرجع النهائي هو النص الرسمي للقانون والمختص القانوني.
      </footer>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        active ? "bg-primary text-white" : "text-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function ComingSoon({ name }: { name: string }) {
  return (
    <div className="text-center text-muted py-16 text-sm">
      {name} — قيد الإنشاء، ستتوفّر قريباً بإذن الله.
    </div>
  );
}

// ————————————————————————————— حاسبة الرسوم القضائية —————————————————————————————

function CourtFeesCalculator() {
  const [raw, setRaw] = useState("");
  const [scheduleKey, setScheduleKey] = useState<FeeSchedule["key"]>(
    "recognized",
  );

  const schedule =
    FEE_SCHEDULES.find((s) => s.key === scheduleKey) ?? FEE_SCHEDULES[0];

  const value = useMemo(() => {
    const digits = raw.replace(/[^\d]/g, "");
    return digits ? parseInt(digits, 10) : 0;
  }, [raw]);

  const result = useMemo(
    () => computeCourtFee(value, schedule),
    [value, schedule],
  );

  return (
    <div className="space-y-5">
      <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5">
            قيمة الدعوى (بالريال اليمني)
          </label>
          <input
            inputMode="numeric"
            value={raw ? formatYER(value) : ""}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="مثال: 5,000,000"
            className="w-full bg-transparent border border-border rounded-xl px-3 py-2.5 text-base outline-none focus:border-primary transition-colors"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">
            الصيغة المطبَّقة
          </label>
          <div className="flex flex-col gap-2">
            {FEE_SCHEDULES.map((s) => (
              <label
                key={s.key}
                className={`flex items-start gap-2 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                  scheduleKey === s.key
                    ? s.recognized
                      ? "border-primary bg-primary/5"
                      : "border-red-400 bg-red-50 dark:bg-red-950/30"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <input
                  type="radio"
                  name="schedule"
                  checked={scheduleKey === s.key}
                  onChange={() => setScheduleKey(s.key)}
                  className="mt-1"
                />
                <span className="text-sm">
                  <span
                    className={`font-medium ${s.recognized ? "" : "text-red-600 dark:text-red-400"}`}
                  >
                    {s.label}
                  </span>
                  <span className="block text-xs text-muted mt-0.5">
                    {s.note}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {!schedule.recognized && (
        <p className="text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg p-3">
          ⚠ أنت تحسب وفق تعديل صادر في صنعاء بعد 2014 وهو غير معترف به. النِّسب
          الرسمية المعتمدة هي «الصيغة الأصلية».
        </p>
      )}

      {value > 0 && (
        <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm">
          <div className="flex items-baseline justify-between gap-3 mb-4">
            <span className="text-sm text-muted">الرسم القضائي المستحق</span>
            <span className="text-2xl font-bold text-primary">
              {formatYER(result.fee)}{" "}
              <span className="text-sm font-normal text-muted">ريال</span>
            </span>
          </div>

          {result.minApplied && (
            <p className="text-xs text-amber-700 dark:text-amber-400 mb-2">
              طُبِّق الحدّ الأدنى للرسم ({formatYER(schedule.minFee)} ريال).
            </p>
          )}
          {result.maxApplied && (
            <p className="text-xs text-amber-700 dark:text-amber-400 mb-2">
              طُبِّق الحدّ الأقصى للرسم في الدعاوى المدنية (
              {formatYER(schedule.maxFee ?? 0)} ريال).
            </p>
          )}

          <div className="border-t border-border pt-3 mt-3">
            <h3 className="text-xs font-bold text-muted mb-2">
              تفصيل الشرائح
            </h3>
            <div className="space-y-1.5">
              {result.rows.map((r, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <span className="text-muted">
                    {r.to == null
                      ? `ما زاد عن ${formatYER(r.from)}`
                      : `${formatYER(r.from)} – ${formatYER(r.to)}`}{" "}
                    × {(r.rate * 100).toLocaleString("ar-YE")}٪
                  </span>
                  <span className="font-medium">{formatYER(r.fee)} ريال</span>
                </div>
              ))}
              {result.minApplied && (
                <div className="flex items-center justify-between gap-2 text-xs text-muted">
                  <span>مجموع الشرائح قبل الحدّ الأدنى</span>
                  <span>{formatYER(result.rawFee)} ريال</span>
                </div>
              )}
            </div>
          </div>

          <p className="text-xs text-muted mt-4 leading-6">
            المصدر: المادة (5) من قانون الرسوم القضائية رقم (26) لسنة 2013م.
            النتيجة استرشادية وقد تُضاف رسوم أخرى (تنفيذ، إعلانات، خبرة…) بحسب
            نوع الدعوى ومرحلتها.
          </p>
        </div>
      )}
    </div>
  );
}

// ————————————————————————————— حاسبة المواعيد القانونية —————————————————————————————

function DeadlinesCalculator() {
  const [ruleKey, setRuleKey] = useState<string>(DEADLINE_RULES[0].key);
  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [dateStr, setDateStr] = useState<string>(todayISO);

  const rule: DeadlineRule =
    DEADLINE_RULES.find((r) => r.key === ruleKey) ?? DEADLINE_RULES[0];

  const result = useMemo(() => {
    if (!dateStr) return null;
    const start = new Date(dateStr + "T00:00:00");
    if (isNaN(start.getTime())) return null;
    return computeDeadline(rule, start);
  }, [rule, dateStr]);

  return (
    <div className="space-y-5">
      <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5">
            نوع الإجراء / الطعن
          </label>
          <select
            value={ruleKey}
            onChange={(e) => setRuleKey(e.target.value)}
            className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-base outline-none focus:border-primary transition-colors"
          >
            {DEADLINE_RULES.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label} — {r.days} يوماً
              </option>
            ))}
          </select>
          <p className="text-xs text-muted mt-1.5">
            المدة: {rule.days} يوماً ({rule.basisArticle}) — تبدأ {rule.startLabel}.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">
            تاريخ البدء (
            {rule.startBasis === "judgment"
              ? "صدور الحكم"
              : rule.startBasis === "notification"
                ? "الإعلان"
                : "الواقعة"}
            )
          </label>
          <input
            type="date"
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
            className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-base outline-none focus:border-primary transition-colors"
          />
        </div>
      </div>

      {result && (
        <div
          className={`border rounded-2xl p-5 shadow-sm ${
            result.expired
              ? "bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-900"
              : "bg-surface border-border"
          }`}
        >
          <div className="flex items-baseline justify-between gap-3 mb-2">
            <span className="text-sm text-muted">آخر موعد للإجراء</span>
            <span
              className={`text-lg font-bold ${
                result.expired ? "text-red-600 dark:text-red-400" : "text-primary"
              }`}
            >
              {formatDateAr(result.deadline)}
            </span>
          </div>

          <div className="text-sm">
            {result.expired ? (
              <p className="text-red-700 dark:text-red-300 font-medium">
                ⚠ انقضى الميعاد منذ {Math.abs(result.daysRemaining)} يوماً.
              </p>
            ) : result.isLastDay ? (
              <p className="text-amber-700 dark:text-amber-400 font-medium">
                اليوم هو آخر يوم في الميعاد.
              </p>
            ) : (
              <p className="text-foreground">
                المتبقّي:{" "}
                <span className="font-bold text-primary">
                  {result.daysRemaining} يوماً
                </span>
              </p>
            )}
          </div>

          {rule.note && (
            <p className="text-xs text-muted mt-3">{rule.note}</p>
          )}

          <p className="text-xs text-muted mt-4 leading-6">
            المصدر: {rule.basisArticle} من قانون المرافعات والتنفيذ المدني رقم
            (40) لسنة 2002م. النتيجة استرشادية؛ قد يتأثّر الميعاد ببدء الاحتساب
            (من النطق بالحكم أو الإعلان)، وبأيام العطل الرسمية، ومسافة الطريق،
            ووقف الميعاد قانوناً (مثل وفاة المحكوم عليه — المادة 277). راجع
            المختصّ القانوني.
          </p>
        </div>
      )}
    </div>
  );
}

// ————————————————————————————— حاسبة المواريث (الفرائض) —————————————————————————————

interface HeirField {
  key: keyof Heirs;
  label: string;
  type: "bool" | "count";
  max?: number;
}

const HEIR_GROUPS: { title: string; fields: HeirField[] }[] = [
  {
    title: "الزوجية",
    fields: [
      { key: "husband", label: "الزوج", type: "bool" },
      { key: "wives", label: "الزوجات", type: "count", max: 4 },
    ],
  },
  {
    title: "الأصول",
    fields: [
      { key: "father", label: "الأب", type: "bool" },
      { key: "mother", label: "الأم", type: "bool" },
      { key: "grandfather", label: "الجدّ (أب الأب)", type: "bool" },
      { key: "grandmother", label: "الجدّات", type: "count", max: 4 },
    ],
  },
  {
    title: "الفروع",
    fields: [
      { key: "sons", label: "الأبناء", type: "count", max: 20 },
      { key: "daughters", label: "البنات", type: "count", max: 20 },
      { key: "grandsons", label: "أبناء الابن", type: "count", max: 20 },
      { key: "granddaughters", label: "بنات الابن", type: "count", max: 20 },
    ],
  },
  {
    title: "الحواشي (الإخوة والأخوات)",
    fields: [
      { key: "fullBrothers", label: "إخوة أشقّاء", type: "count", max: 20 },
      { key: "fullSisters", label: "أخوات شقيقات", type: "count", max: 20 },
      { key: "paternalBrothers", label: "إخوة لأب", type: "count", max: 20 },
      { key: "paternalSisters", label: "أخوات لأب", type: "count", max: 20 },
      { key: "maternalSiblings", label: "إخوة لأم", type: "count", max: 20 },
    ],
  },
];

function InheritanceCalculator() {
  const [heirs, setHeirs] = useState<Heirs>(EMPTY_HEIRS);
  const [estateRaw, setEstateRaw] = useState("");

  const estate = useMemo(() => {
    const d = estateRaw.replace(/[^\d]/g, "");
    return d ? parseInt(d, 10) : 0;
  }, [estateRaw]);

  const anyHeir = useMemo(
    () =>
      Object.entries(heirs).some(([, v]) =>
        typeof v === "boolean" ? v : v > 0,
      ),
    [heirs],
  );

  const result = useMemo(
    () => (anyHeir ? computeInheritance(heirs) : null),
    [heirs, anyHeir],
  );

  function setField(key: keyof Heirs, value: boolean | number) {
    setHeirs((h) => ({ ...h, [key]: value }));
  }

  function amount(f: Frac): string {
    if (!estate) return "";
    return formatYER((estate * f.n) / f.d);
  }

  return (
    <div className="space-y-5">
      <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm space-y-5">
        {HEIR_GROUPS.map((g) => (
          <div key={g.title}>
            <h3 className="text-sm font-bold text-primary mb-2">{g.title}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {g.fields.map((f) => (
                <HeirInput
                  key={f.key}
                  field={f}
                  value={heirs[f.key]}
                  onChange={(v) => setField(f.key, v)}
                />
              ))}
            </div>
          </div>
        ))}

        <div className="border-t border-border pt-4">
          <label className="block text-sm font-medium mb-1.5">
            قيمة التركة (اختياري — لإظهار المبالغ)
          </label>
          <input
            inputMode="numeric"
            value={estateRaw ? formatYER(estate) : ""}
            onChange={(e) => setEstateRaw(e.target.value)}
            placeholder="مثال: 10,000,000"
            className="w-full bg-transparent border border-border rounded-xl px-3 py-2.5 text-base outline-none focus:border-primary transition-colors"
          />
        </div>

        <button
          onClick={() => {
            setHeirs(EMPTY_HEIRS);
            setEstateRaw("");
          }}
          className="text-xs text-muted hover:text-foreground underline"
        >
          مسح الكل
        </button>
      </div>

      {result && result.allocations.length > 0 && (
        <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm">
          {/* الأعلام */}
          <div className="flex flex-wrap gap-2 mb-3">
            {result.flags.awl && <Flag color="amber">عَوْل</Flag>}
            {result.flags.radd && <Flag color="amber">رَدّ</Flag>}
            {result.flags.umariyya && <Flag color="primary">العُمريّتان</Flag>}
            {result.flags.asabaMaaGhair && (
              <Flag color="primary">عصبة مع الغير</Flag>
            )}
            {result.flags.residueToTreasury && (
              <Flag color="red">فائض لبيت المال</Flag>
            )}
          </div>

          <div className="space-y-2">
            {result.allocations.map((a) => (
              <div
                key={a.key}
                className="flex items-start justify-between gap-3 py-2 border-b border-border last:border-0"
              >
                <div>
                  <div className="font-medium text-sm">
                    {a.label}
                    {a.count > 1 && (
                      <span className="text-muted text-xs"> ({a.count})</span>
                    )}
                  </div>
                  <div className="text-xs text-muted mt-0.5">{a.reason}</div>
                  {a.perMale && a.perFemale ? (
                    <div className="text-xs text-muted mt-0.5">
                      للذكر {fracToString(a.perMale)}
                      {estate ? ` (${amount(a.perMale)})` : ""} — للأنثى{" "}
                      {fracToString(a.perFemale)}
                      {estate ? ` (${amount(a.perFemale)})` : ""}
                    </div>
                  ) : a.count > 1 ? (
                    <div className="text-xs text-muted mt-0.5">
                      لكلّ واحد {fracToString(a.perHead)}
                      {estate ? ` (${amount(a.perHead)})` : ""}
                    </div>
                  ) : null}
                </div>
                <div className="text-left shrink-0">
                  <div className="font-bold text-primary">
                    {fracToString(a.share)}
                  </div>
                  <div className="text-xs text-muted">
                    {fracToPercent(a.share)}
                  </div>
                  {estate > 0 && (
                    <div className="text-xs font-medium mt-0.5">
                      {amount(a.share)} ريال
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {result.blocked.length > 0 && (
            <div className="mt-4 border-t border-border pt-3">
              <h4 className="text-xs font-bold text-muted mb-1.5">
                المحجوبون
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {result.blocked.map((b, i) => (
                  <span
                    key={i}
                    className="text-xs px-2 py-0.5 rounded-full bg-foreground/5 text-muted"
                    title={`محجوب بـ${b.by}`}
                  >
                    {b.label} ✕ ({b.by})
                  </span>
                ))}
              </div>
            </div>
          )}

          {result.notes.length > 0 && (
            <ul className="mt-4 space-y-1 text-xs text-muted list-disc pr-4">
              {result.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}

          <p className="text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg p-3 mt-4 leading-6">
            ⚠ هذه الحاسبة استرشادية مبنية على أصول الفرائض وقانون الأحوال
            الشخصية رقم (20) لسنة 1992م. لا تشمل بعض الحالات الخاصّة (الجدّ مع
            الإخوة، الحمل، المفقود، الخنثى، ذوي الأرحام، الوصايا والديون). المرجع
            النهائي هو القاضي الشرعي والمختصّ.
          </p>
        </div>
      )}
    </div>
  );
}

function HeirInput({
  field,
  value,
  onChange,
}: {
  field: HeirField;
  value: boolean | number;
  onChange: (v: boolean | number) => void;
}) {
  if (field.type === "bool") {
    return (
      <label
        className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer text-sm transition-colors ${
          value
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50"
        }`}
      >
        <input
          type="checkbox"
          checked={value as boolean}
          onChange={(e) => onChange(e.target.checked)}
        />
        {field.label}
      </label>
    );
  }
  const num = value as number;
  return (
    <div
      className={`flex items-center justify-between gap-1 p-2 rounded-xl border text-sm ${
        num > 0 ? "border-primary bg-primary/5" : "border-border"
      }`}
    >
      <span className="text-xs">{field.label}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, num - 1))}
          className="w-6 h-6 rounded-md border border-border hover:border-primary leading-none"
        >
          −
        </button>
        <span className="w-5 text-center font-medium">{num}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(field.max ?? 20, num + 1))}
          className="w-6 h-6 rounded-md border border-border hover:border-primary leading-none"
        >
          +
        </button>
      </div>
    </div>
  );
}

function Flag({
  color,
  children,
}: {
  color: "amber" | "primary" | "red";
  children: React.ReactNode;
}) {
  const cls =
    color === "amber"
      ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
      : color === "red"
        ? "bg-red-600 text-white"
        : "bg-primary/10 text-primary";
  return (
    <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${cls}`}>
      {children}
    </span>
  );
}
