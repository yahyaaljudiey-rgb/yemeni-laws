"use client";

import { useState } from "react";
import Link from "next/link";

interface IngestResult {
  file: string;
  law_id: number;
  title: string;
  articles: number;
}

export default function AdminPage() {
  const [files, setFiles] = useState<FileList | null>(null);
  const [title, setTitle] = useState("");
  const [lawNumber, setLawNumber] = useState("");
  const [year, setYear] = useState("");
  const [category, setCategory] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<IngestResult[] | null>(null);

  async function upload() {
    if (!files || files.length === 0) {
      setError("الرجاء اختيار ملف واحد على الأقل");
      return;
    }
    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const form = new FormData();
      Array.from(files).forEach((f) => form.append("files", f));
      if (title.trim()) form.append("title", title.trim());
      if (lawNumber.trim()) form.append("law_number", lawNumber.trim());
      if (year.trim()) form.append("year", year.trim());
      if (category.trim()) form.append("category", category.trim());

      const res = await fetch("/api/ingest", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تعذّر رفع الملفات");
      setResults(data.results as IngestResult[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:border-primary transition-colors text-sm";

  return (
    <div className="flex flex-col min-h-full">
      <header className="border-b border-border bg-surface">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-primary">
              إضافة قوانين إلى المكتبة
            </h1>
            <p className="text-xs sm:text-sm text-muted mt-1">
              ارفع ملفات القوانين (PDF / Word / نصية) وسيتم تقسيمها إلى مواد
              وفهرستها للبحث الذكي
            </p>
          </div>
          <Link
            href="/"
            className="text-sm px-3 py-2 rounded-lg border border-border hover:border-primary hover:text-primary transition-colors whitespace-nowrap"
          >
            عودة للبحث
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6">
        <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm space-y-4">
          {/* اختيار الملفات */}
          <div>
            <label className="block text-sm font-medium mb-2">
              ملفات القانون <span className="text-red-500">*</span>
            </label>
            <input
              type="file"
              multiple
              accept=".pdf,.docx,.txt,.md"
              onChange={(e) => setFiles(e.target.files)}
              className="block w-full text-sm text-muted file:ml-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary file:text-white file:cursor-pointer hover:file:bg-primary-strong"
            />
            <p className="text-xs text-muted mt-1">
              الصيغ المدعومة: PDF و Word (docx) والملفات النصية. صيغة .doc
              القديمة غير مدعومة.
            </p>
          </div>

          {/* بيانات وصفية */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium mb-2">
                عنوان القانون
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="مثال: قانون العقوبات"
                className={inputClass}
              />
              <p className="text-xs text-muted mt-1">
                إن تُرك فارغاً، يُستخدم اسم الملف. (يُطبَّق على كل الملفات
                المرفوعة في هذه الدفعة)
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">رقم القانون</label>
              <input
                value={lawNumber}
                onChange={(e) => setLawNumber(e.target.value)}
                placeholder="مثال: 12"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">سنة الإصدار</label>
              <input
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="مثال: 1994"
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium mb-2">التصنيف</label>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="مثال: جنائي / مدني / تجاري"
                className={inputClass}
              />
            </div>
          </div>

          <button
            onClick={upload}
            disabled={loading}
            className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-primary-strong disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "جارٍ المعالجة والفهرسة…" : "رفع وفهرسة"}
          </button>

          {loading && (
            <p className="text-xs text-muted">
              قد تستغرق أول عملية رفع وقتاً إضافياً لتنزيل نموذج التضمين الدلالي
              لأول مرة.
            </p>
          )}
        </div>

        {error && (
          <div className="mt-4 p-4 rounded-xl border border-red-300 bg-red-50 text-red-800 text-sm dark:bg-red-950/40 dark:border-red-800 dark:text-red-200">
            {error}
          </div>
        )}

        {results && (
          <div className="mt-6 space-y-3">
            <h2 className="text-sm font-bold text-muted">نتيجة المعالجة</h2>
            {results.map((r, i) => (
              <div
                key={i}
                className={`p-4 rounded-xl border text-sm ${
                  r.articles > 0
                    ? "border-border bg-surface"
                    : "border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800"
                }`}
              >
                <div className="font-medium">{r.file}</div>
                {r.articles > 0 ? (
                  <p className="text-muted mt-1">
                    تمت إضافة «{r.title}» — {r.articles} مادة مفهرسة بنجاح ✓
                  </p>
                ) : (
                  <p className="text-amber-700 dark:text-amber-300 mt-1">
                    لم يُستخرج نص قابل للتقسيم من هذا الملف (قد يكون ملفاً ممسوحاً
                    ضوئياً/صورة). جرّب نسخة نصية أو PDF يحتوي نصاً قابلاً للتحديد.
                  </p>
                )}
              </div>
            ))}
            <Link
              href="/"
              className="inline-block mt-2 px-5 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-strong transition-colors"
            >
              ابدأ البحث الآن
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
