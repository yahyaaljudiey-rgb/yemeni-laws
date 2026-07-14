"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import SiteFooter from "../site-footer";
import AppBottomNav from "../app-bottom-nav";
import {
  FEE_SCHEDULES,
  FIXED_FEES,
  FIXED_FEE_GROUPS,
  VALUE_BASES,
  ARTICLE5_TEXT,
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
import {
  DIYA_INJURIES,
  FULL_DIYA_ORGANS,
  diyaAmount,
  type DiyaGender,
  type DiyaIntent,
  type DiyaInjury,
} from "@/lib/calculators/diya";

type Tool = "fees" | "deadlines" | "inheritance" | "diya";

export default function ToolsPage() {
  const [tool, setTool] = useState<Tool>("fees");

  return (
    <div className="flex flex-col min-h-full pb-16">
      <header className="yl-appbar sticky top-0 z-30 shadow-md">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="leading-tight">
            <span className="yl-appbar-title block font-bold text-lg">
              الحاسبات القانونية
            </span>
            <span className="yl-appbar-sign block text-[11px]">
              تطوير: يحيى الجديعي
            </span>
          </div>
          <Link href="/" className="yl-appbar-btn text-sm whitespace-nowrap">
            ← الرئيسية
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6 pb-24">
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
          <TabButton active={tool === "diya"} onClick={() => setTool("diya")}>
            الديات والأروش
          </TabButton>
        </div>

        {tool === "fees" && <CourtFeesCalculator />}
        {tool === "deadlines" && <DeadlinesCalculator />}
        {tool === "inheritance" && <InheritanceCalculator />}
        {tool === "diya" && <DiyaCalculator />}
      </main>

      <SiteFooter />
      <AppBottomNav active="tools" />
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
  const [feeMode, setFeeMode] = useState<"value" | "fixed">("value");
  const [raw, setRaw] = useState("");
  const [basisKey, setBasisKey] = useState(VALUE_BASES[0].key);
  const [scheduleKey, setScheduleKey] = useState<FeeSchedule["key"]>(
    "aden2025",
  );

  const basis = VALUE_BASES.find((b) => b.key === basisKey) ?? VALUE_BASES[0];
  const [fixedKey, setFixedKey] = useState(FIXED_FEES[0].key);
  const [unitCount, setUnitCount] = useState(1);

  const schedule =
    FEE_SCHEDULES.find((s) => s.key === scheduleKey) ?? FEE_SCHEDULES[0];

  const value = useMemo(() => {
    // نحوّل الأرقام العربية-الهندية (المعروضة) إلى لاتينية أولاً، ثم نُبقي الأرقام فقط
    const digits = raw
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/[^\d]/g, "");
    return digits ? parseInt(digits, 10) : 0;
  }, [raw]);

  const result = useMemo(
    () => computeCourtFee(value, schedule),
    [value, schedule],
  );

  const fixed = FIXED_FEES.find((f) => f.key === fixedKey) ?? FIXED_FEES[0];
  const fixedTotal = fixed.amount * Math.max(1, unitCount);

  return (
    <div className="space-y-5">
      {/* مبدّل نوع الرسم */}
      <div className="inline-flex rounded-xl border border-border bg-surface p-1 gap-1">
        <button
          onClick={() => setFeeMode("value")}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            feeMode === "value" ? "bg-primary text-white" : "text-muted hover:text-foreground"
          }`}
        >
          دعوى معلومة القيمة (نسبي)
        </button>
        <button
          onClick={() => setFeeMode("fixed")}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            feeMode === "fixed" ? "bg-primary text-white" : "text-muted hover:text-foreground"
          }`}
        >
          رسوم ثابتة (حسب النوع)
        </button>
      </div>

      {feeMode === "fixed" ? (
        <FixedFeesCalculator
          fixedKey={fixedKey}
          setFixedKey={setFixedKey}
          unitCount={unitCount}
          setUnitCount={setUnitCount}
          fixed={fixed}
          total={fixedTotal}
        />
      ) : (
        <>
      <p className="text-xs text-muted leading-6 -mt-1">
        هذا الوضع يحسب <b>الرسم النسبي</b> على دعاوى المنازعات المدنية والتجارية
        والإدارية <b>معلومة القيمة</b> (المادة 5). للرسوم الأخرى (أحوال شخصية،
        تنفيذ، طعون…) اختر «رسوم ثابتة».
      </p>
      <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5">
            نوع الدعوى (لتحديد أساس القيمة)
          </label>
          <select
            value={basisKey}
            onChange={(e) => setBasisKey(e.target.value)}
            className="w-full bg-transparent border border-border rounded-xl px-3 py-2.5 text-base outline-none focus:border-primary transition-colors"
          >
            {VALUE_BASES.map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted leading-6 bg-primary/5 border border-primary/15 rounded-lg p-2.5 mt-2">
            <span className="font-bold text-foreground">أساس القيمة: </span>
            {basis.basis} <span className="opacity-70">(المادة 6)</span>
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">
            {basisKey === "tax"
              ? "قيمة الدعوى المقدَّرة (بواسطة خبير) بالريال"
              : "قيمة الدعوى (بالريال اليمني)"}
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
          الرسمية المعتمدة هي «صيغة عدن 2025».
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
              {schedule.flat ? "طريقة الحساب" : "تفصيل الشرائح"}
            </h3>
            <div className="space-y-1.5">
              {schedule.flat ? (
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-muted">
                    {formatYER(value)} × {(result.rows[0]?.rate ?? 0) * 100}٪
                    (النسبة حسب شريحة المبلغ)
                  </span>
                  <span className="font-medium">
                    {formatYER(result.rawFee)} ريال
                  </span>
                </div>
              ) : (
                result.rows.map((r, i) => (
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
                ))
              )}
              {result.minApplied && (
                <div className="flex items-center justify-between gap-2 text-xs text-muted">
                  <span>الرسم قبل تطبيق الحدّ الأدنى</span>
                  <span>{formatYER(result.rawFee)} ريال</span>
                </div>
              )}
            </div>
          </div>

          {value > 0 && (
            <p className="text-xs text-primary bg-primary/5 border border-primary/15 rounded-lg p-2.5 mt-3 leading-6">
              💡 يُحصَّل <b>80%</b> من الرسم عند رفع الدعوى (
              {formatYER(Math.round(result.fee * 0.8))} ريال)، والباقي عند إصدار
              الحكم (المادة 12).
            </p>
          )}

          <div className="border-t border-border mt-4 pt-3">
            <h3 className="text-xs font-bold text-muted mb-1.5">
              نصّ المادة (5)
            </h3>
            <p className="legal-text text-sm">{ARTICLE5_TEXT}</p>
          </div>
          <p className="text-xs text-muted mt-3 leading-6">
            المصدر: المادة (5) من قانون الرسوم القضائية رقم (26) لسنة 2013م،
            بصيغتها المعدَّلة بقرار رئيس مجلس القضاء الأعلى رقم (41) لسنة 2025م
            (عدن). النتيجة استرشادية وقد تُضاف رسوم أخرى (تنفيذ، إعلانات، خبرة…)
            بحسب نوع الدعوى ومرحلتها.
          </p>
        </div>
      )}
        </>
      )}
    </div>
  );
}

// جدول الرسوم الثابتة حسب نوع الدعوى/الطلب
function FixedFeesCalculator({
  fixedKey,
  setFixedKey,
  unitCount,
  setUnitCount,
  fixed,
  total,
}: {
  fixedKey: string;
  setFixedKey: (k: string) => void;
  unitCount: number;
  setUnitCount: (n: number) => void;
  fixed: (typeof FIXED_FEES)[number];
  total: number;
}) {
  return (
    <>
      <p className="text-xs text-muted leading-6 -mt-1">
        اختر نوع الدعوى أو الطلب ليظهر رسمه الثابت وفق قرار عدن رقم (41) لسنة
        2025م.
      </p>
      <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5">
            نوع الدعوى / الطلب
          </label>
          <select
            value={fixedKey}
            onChange={(e) => setFixedKey(e.target.value)}
            className="w-full bg-transparent border border-border rounded-xl px-3 py-2.5 text-base outline-none focus:border-primary transition-colors"
          >
            {FIXED_FEE_GROUPS.map((g) => (
              <optgroup key={g} label={g}>
                {FIXED_FEES.filter((f) => f.group === g).map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label} ({f.article})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        {fixed.perUnit && (
          <div>
            <label className="block text-sm font-medium mb-1.5">
              العدد ({fixed.perUnit})
            </label>
            <input
              type="number"
              min={1}
              value={unitCount}
              onChange={(e) => setUnitCount(parseInt(e.target.value, 10) || 1)}
              className="w-28 bg-transparent border border-border rounded-xl px-3 py-2.5 text-base outline-none focus:border-primary transition-colors"
            />
          </div>
        )}
      </div>

      <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-muted">الرسم المستحق</span>
          <span className="text-2xl font-bold text-primary">
            {formatYER(total)}{" "}
            <span className="text-sm font-normal text-muted">ريال</span>
          </span>
        </div>
        {fixed.perUnit && unitCount > 1 && (
          <p className="text-xs text-muted mt-1">
            {formatYER(fixed.amount)} × {unitCount} {fixed.perUnit}
          </p>
        )}
        <p className="text-xs text-primary bg-primary/5 border border-primary/15 rounded-lg p-2.5 mt-3 leading-6">
          💡 يُعفى من الرسوم من يثبت عجزه عن دفعها بقرار من رئيس المحكمة (المادة
          29).
        </p>
        <div className="border-t border-border mt-4 pt-3">
          <h3 className="text-xs font-bold text-muted mb-1.5">
            نصّ المادة — {fixed.article}
          </h3>
          <p className="legal-text text-sm">{fixed.text}</p>
        </div>
        <p className="text-xs text-muted mt-3 leading-6">
          المصدر: {fixed.article} من قانون الرسوم القضائية رقم (26) لسنة 2013م
          بصيغتها المعدَّلة بقرار رئيس مجلس القضاء الأعلى رقم (41) لسنة 2025م
          (عدن). النتيجة استرشادية.
        </p>
      </div>
    </>
  );
}

// ————————————————————————————— حاسبة المواعيد القانونية —————————————————————————————

function DeadlinesCalculator() {
  const [ruleKey, setRuleKey] = useState<string>(DEADLINE_RULES[0].key);
  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [dateStr, setDateStr] = useState<string>(todayISO);

  const rule: DeadlineRule =
    DEADLINE_RULES.find((r) => r.key === ruleKey) ?? DEADLINE_RULES[0];

  const [manualUrgent, setManualUrgent] = useState(false);
  // قضية مستعجلة: بعض الأنواع مستعجلة بطبيعتها (rule.urgent)، وإلا يحدّدها المستخدم
  const urgent = manualUrgent || !!rule.urgent;

  const result = useMemo(() => {
    if (!dateStr) return null;
    const start = new Date(dateStr + "T00:00:00");
    if (isNaN(start.getTime())) return null;
    return computeDeadline(rule, start, new Date(), urgent);
  }, [rule, dateStr, urgent]);

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

        <label className="flex items-start gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={urgent}
            disabled={!!rule.urgent}
            onChange={(e) => setManualUrgent(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-primary disabled:opacity-60"
          />
          <span className="text-sm leading-6">
            قضية مستعجلة
            <span className="text-xs text-muted block">
              تُنظر خلال العطلة القضائية (م.73 سلطة قضائية)، فلا يوقف رمضان
              ميعادها — لكنها تظلّ تتأثّر بالجمعة/السبت والعطل الرسمية والأعياد.
              {rule.urgent ? " (هذا النوع مستعجل بطبيعته)" : ""}
            </span>
          </span>
        </label>
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

          {result.extended && (
            <div className="mt-3 text-xs leading-6 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg p-2.5">
              <p className="text-amber-800 dark:text-amber-300 font-medium">
                ⚠ لو حُسبت العطل لانتهى الميعاد في{" "}
                {formatDateAr(result.rawDeadline)}، لكنّ العطل لا تُحسب — فاستُبعِد{" "}
                <span className="font-bold">{result.skippedDays}</span> يوماً
                (عطلات) ومُدَّ الميعاد تبعاً لذلك.
              </p>
              <p className="text-amber-700 dark:text-amber-400 mt-1">
                العطل المستبعَدة:{" "}
                {Array.from(
                  new Set(result.skippedHolidays.map((s) => s.name)),
                ).join("، ")}
                .
              </p>
              <p className="text-amber-700 dark:text-amber-400 mt-1">
                المادة (111) مرافعات: «العطلات الرسمية والقضائية توقف المواعيد».
              </p>
            </div>
          )}

          {rule.note && (
            <p className="text-xs text-muted mt-3">{rule.note}</p>
          )}

          <p className="text-xs text-muted mt-4 leading-6">
            المصدر: {rule.basisArticle} من قانون المرافعات والتنفيذ المدني رقم
            (40) لسنة 2002م. القاعدة المعتمدة (م.111): العطلات لا تُحسب ضمن
            المدّة، فتُستبعَد أيامها أينما وقعت — وتشمل: الجمعة والسبت؛ والعطل
            الرسمية الوطنية (عيد العمال، اليوم الوطني، ثورتا سبتمبر وأكتوبر،
            الاستقلال)؛ والدينية (عيدا الفطر والأضحى، ذكرى الهجرة)؛ والعطلة
            القضائية (رمضان وذو الحجة — م.73، ولا توقف المستعجلة). — وفق قانون
            الإجازات رقم (2) لسنة 2000م (م.3).
            ملاحظات: العطل الهجرية تقريبية (أم القرى) وقد تختلف يوماً؛ وقد يتأثّر
            الميعاد ببدء الاحتساب ومسافة الطريق ووقف الميعاد قانوناً (م.277).
            النتيجة استرشادية — راجع المختصّ القانوني.
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

// ————————————————————————————— حاسبة الديات والأروش —————————————————————————————

interface DiyaLine {
  id: number;
  injury: DiyaInjury;
  gender: DiyaGender;
  intent: DiyaIntent;
  count: number;
  subtotal: number;
}

const GENDER_AR: Record<DiyaGender, string> = { male: "رجل", female: "امرأة" };
const INTENT_AR: Record<DiyaIntent, string> = {
  amd: "عمد وشبه العمد",
  khata: "خطأ",
};

function DiyaCalculator() {
  const [gender, setGender] = useState<DiyaGender>("male");
  const [intent, setIntent] = useState<DiyaIntent>("amd");
  const [injuryKey, setInjuryKey] = useState<string>(DIYA_INJURIES[0].key);
  const [count, setCount] = useState(1);
  const [lines, setLines] = useState<DiyaLine[]>([]);
  const [nextId, setNextId] = useState(1);
  const [copied, setCopied] = useState(false);

  const injury =
    DIYA_INJURIES.find((i) => i.key === injuryKey) ?? DIYA_INJURIES[0];
  const unit = injury.amounts[gender][intent];
  const current = unit * Math.max(1, count);
  const total = useMemo(
    () => lines.reduce((s, l) => s + l.subtotal, 0),
    [lines],
  );

  function addLine() {
    const c = Math.max(1, count);
    setLines((prev) => [
      ...prev,
      { id: nextId, injury, gender, intent, count: c, subtotal: unit * c },
    ]);
    setNextId((n) => n + 1);
  }
  function removeLine(id: number) {
    setLines((prev) => prev.filter((l) => l.id !== id));
  }

  async function copyResult() {
    const body = lines
      .map(
        (l) =>
          `• ${l.injury.name} (${GENDER_AR[l.gender]} — ${INTENT_AR[l.intent]})` +
          `${l.count > 1 ? ` × ${l.count}` : ""} = ${formatYER(l.subtotal)} ريال`,
      )
      .join("\n");
    const text =
      `حساب الدية/الأرش:\n${body}\n— الإجمالي: ${formatYER(total)} ريال\n` +
      `(وفق قرار مجلس القضاء الأعلى رقم 51 لسنة 2024م — عبر تطبيق Yemeni Laws)`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* تجاهل */
    }
  }

  return (
    <div className="space-y-5">
      {/* الاختيارات */}
      <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm space-y-4">
        {/* الجنس */}
        <div>
          <label className="block text-sm font-medium mb-1.5">الجنس</label>
          <div className="inline-flex rounded-xl border border-border p-1 gap-1">
            {(["male", "female"] as DiyaGender[]).map((g) => (
              <button
                key={g}
                onClick={() => setGender(g)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  gender === g
                    ? "bg-primary text-white"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {GENDER_AR[g]}
              </button>
            ))}
          </div>
        </div>

        {/* نوع الجناية */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            نوع الجناية
          </label>
          <div className="inline-flex rounded-xl border border-border p-1 gap-1">
            {(["amd", "khata"] as DiyaIntent[]).map((t) => (
              <button
                key={t}
                onClick={() => setIntent(t)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  intent === t
                    ? "bg-primary text-white"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {INTENT_AR[t]}
              </button>
            ))}
          </div>
        </div>

        {/* نوع الإصابة + العدد */}
        <div className="grid sm:grid-cols-[1fr_auto] gap-3">
          <div>
            <label className="block text-sm font-medium mb-1.5">
              نوع الإصابة
            </label>
            <select
              value={injuryKey}
              onChange={(e) => setInjuryKey(e.target.value)}
              className="w-full bg-transparent border border-border rounded-xl px-3 py-2.5 text-base outline-none focus:border-primary transition-colors"
            >
              {DIYA_INJURIES.map((i) => (
                <option key={i.key} value={i.key}>
                  {i.name} — {i.fractionLabel}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">العدد</label>
            <input
              type="number"
              min={1}
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value, 10) || 1)}
              className="w-24 bg-transparent border border-border rounded-xl px-3 py-2.5 text-base outline-none focus:border-primary transition-colors"
            />
          </div>
        </div>

        {/* بطاقة تعريف الإصابة المختارة */}
        <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-bold text-primary">
              {injury.name}
            </span>
            <span className="text-xs text-muted">{injury.fractionLabel}</span>
          </div>
          {injury.fiqh && (
            <p className="text-xs text-muted leading-6">{injury.fiqh}</p>
          )}
          <div className="flex items-baseline justify-between gap-3 pt-1 border-t border-primary/15">
            <span className="text-xs text-muted">
              المبلغ ({GENDER_AR[gender]} — {INTENT_AR[intent]}
              {count > 1 ? ` × ${count}` : ""})
            </span>
            <span className="text-lg font-bold text-primary">
              {formatYER(current)}{" "}
              <span className="text-xs font-normal text-muted">ريال</span>
            </span>
          </div>
          <button
            onClick={addLine}
            className="w-full mt-1 px-3 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            ➕ أضِف إلى الحساب
          </button>
        </div>
      </div>

      {/* سلة الحساب */}
      {lines.length > 0 && (
        <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="text-sm font-bold">الإصابات المضافة</h3>
            <button
              onClick={() => setLines([])}
              className="text-xs text-muted hover:text-red-600"
            >
              تفريغ الكل
            </button>
          </div>
          <div className="space-y-2">
            {lines.map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between gap-2 text-sm border-b border-border/60 pb-2"
              >
                <button
                  onClick={() => removeLine(l.id)}
                  title="حذف"
                  className="text-red-500 hover:text-red-700 text-base leading-none px-1"
                >
                  ×
                </button>
                <span className="flex-1">
                  {l.injury.name}
                  <span className="text-xs text-muted">
                    {" "}
                    ({GENDER_AR[l.gender]} — {INTENT_AR[l.intent]}
                    {l.count > 1 ? ` × ${l.count}` : ""})
                  </span>
                </span>
                <span className="font-medium whitespace-nowrap">
                  {formatYER(l.subtotal)} ريال
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-baseline justify-between gap-3 mt-4 pt-3 border-t border-border">
            <span className="text-sm text-muted">الإجمالي</span>
            <span className="text-2xl font-bold text-primary">
              {formatYER(total)}{" "}
              <span className="text-sm font-normal text-muted">ريال</span>
            </span>
          </div>
          <button
            onClick={copyResult}
            className="w-full mt-3 px-3 py-2 rounded-lg border border-border text-sm font-medium hover:border-primary hover:text-primary transition-colors"
          >
            {copied ? "✓ تم النسخ" : "⧉ نسخ النتيجة مع العزو"}
          </button>
        </div>
      )}

      {/* ملاحظات */}
      <div className="text-xs text-muted leading-7 bg-surface border border-border rounded-2xl p-4 space-y-2">
        <p>
          <span className="font-bold text-foreground">١-</span> دية المرأة على
          النصف من دية الرجل، وأرشها كأرشه إلى أن يبلغ الأرش ثُلث دية الرجل، وما
          زاد على الثلث يُنصَّف.
        </p>
        <p>
          <span className="font-bold text-foreground">٢-</span> التشوّهات
          (العاهات المستديمة) وكل ما زاد عن المعتاد في طول الجناية يكون أرشه
          «حكومة» يرجع في تقديرها إلى المحكمة.
        </p>
        <p>
          <span className="font-bold text-foreground">٣-</span> تجب الدية كاملة
          في فقد العضو المفرد أو زوج أو أكثر من جنس واحد، ومنها: {FULL_DIYA_ORGANS}
        </p>
        <p className="pt-1 border-t border-border">
          المصدر: جدول الديات والأروش وفق قرار رئيس مجلس القضاء الأعلى رقم (51)
          لسنة 2024م (تعديل المادة 40 من قانون الجرائم والعقوبات). النتيجة
          استرشادية، والمرجع النهائي النصّ الرسمي وتقدير المحكمة.
        </p>
      </div>
    </div>
  );
}
