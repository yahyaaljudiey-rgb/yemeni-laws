"use client";

import { useState, useEffect, useMemo, Fragment } from "react";
import Link from "next/link";
import { segmentAmendments, extractAmendments } from "@/lib/amendments";
import {
  offlineReady,
  clientSearch,
  clientSimilar,
  clientArticle,
  clientVersions,
  clientArticleOfDay,
  clientLawList,
  clientLawArticles,
  normalizeAr,
} from "@/lib/client-search";
import { clientAsk } from "@/lib/client-ask";

interface SearchHit {
  article_id: number;
  law_id: number;
  law_title: string;
  law_number: string | null;
  year: string | null;
  category: string | null;
  article_number: string | null;
  heading: string | null;
  content: string;
  score: number;
  matched_keyword: boolean;
  amend_year: number | null;
  amend_status: string | null;
  amend_note: string | null;
}

// شارة لون لنوع المستند (قانون/لائحة/حكم)
function DocTypeBadge({ category }: { category: string | null }) {
  if (!category || category === "قانون") return null;
  const styles: Record<string, string> = {
    لائحة: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    حكم: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
    دستور: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  };
  const cls = styles[category] || "bg-accent/15 text-accent";
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>
      {category}
    </span>
  );
}

// بناء عزو قانوني رسمي للمادة (يُلحق عند النسخ)
function buildCitation(h: SearchHit): string {
  const parts = [h.law_title];
  if (h.law_number) parts.push(`رقم (${h.law_number})`);
  if (h.year) parts.push(`لسنة ${h.year}م`);
  let cite = parts.join(" ");
  if (h.article_number) cite += `، المادة (${h.article_number})`;
  return cite;
}

// تحويل الأرقام العربية-الهندية إلى لاتينية
function toLatinDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) =>
    String(d.charCodeAt(0) - 0x0660),
  );
}

// إحالات المواد: «المادة (N)» / «المادتين (N)» / «المواد (N)» — نلتقط الرقم
const REF_RE = /(الماد(?:ة|تان|تين|ته)|المواد)\s*\(?\s*([\d٠-٩]+)/g;

// جعل إحالات المواد داخل النص قابلة للنقر
function linkifyRefs(
  text: string,
  lawId: number,
  onRef: (lawId: number, num: string) => void,
  keyPrefix: string,
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  REF_RE.lastIndex = 0;
  let i = 0;
  while ((m = REF_RE.exec(text)) !== null) {
    const numStart = m.index + m[0].length - m[2].length;
    if (numStart > last) nodes.push(text.slice(last, numStart));
    const num = toLatinDigits(m[2]);
    nodes.push(
      <button
        key={`${keyPrefix}-${i++}`}
        onClick={() => onRef(lawId, num)}
        className="text-primary underline decoration-dotted underline-offset-2 hover:decoration-solid"
        title={`عرض المادة (${num})`}
      >
        {m[2]}
      </button>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

// عرض نص المادة مع تلوين أجزاء التعديل ((( ... ))) بالأحمر وربط الإحالات
function ArticleText({
  content,
  lawId,
  onRef,
}: {
  content: string;
  lawId?: number;
  onRef?: (lawId: number, num: string) => void;
}) {
  const segments = segmentAmendments(content);
  const canLink = lawId != null && onRef != null;
  return (
    <>
      {segments.map((seg, i) =>
        seg.amendment ? (
          <span
            key={i}
            className="text-red-600 dark:text-red-400 font-medium"
            title="تعديل على النص"
          >
            {" ("}
            {seg.text}
            {") "}
          </span>
        ) : canLink ? (
          <span key={i}>{linkifyRefs(seg.text, lawId, onRef, `s${i}`)}</span>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  );
}

// واجهة مبسّطة للتعرّف على الصوت (Web Speech API) غير المعرَّفة قياسياً
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

// إزالة علامات التعديل ((( ))) من النص قبل القراءة الصوتية
function plainArticleText(content: string): string {
  return content.replace(/\({3,}/g, "").replace(/\){3,}/g, "").trim();
}

interface AskSource {
  article_id: number;
  law_title: string;
  law_number: string | null;
  year: string | null;
  article_number: string | null;
}

interface DailyArticle {
  article_id: number;
  law_id: number;
  law_title: string;
  law_number: string | null;
  year: string | null;
  article_number: string | null;
  content: string;
  amend_status: string | null;
  amend_year: number | null;
}

// مادة كاملة (للنافذة المرجعية والمواد المشابهة)
type ArticleFull = Omit<SearchHit, "score" | "matched_keyword">;

interface ArticleVersion {
  article_id: number;
  article_number: string | null;
  content: string;
  amend_year: number | null;
  amend_status: string | null;
  amend_note: string | null;
  ordering: number;
}

// لوحة التعديلات: خط زمني للتعديلات + مقارنة النسخ (قبل/بعد) إن وُجدت
function AmendmentPanel({
  lawId,
  articleNumber,
  content,
  onRef,
}: {
  lawId: number;
  articleNumber: string;
  content: string;
  onRef: (lawId: number, num: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<ArticleVersion[] | null>(null);
  const [loading, setLoading] = useState(false);

  // التعديلات المستخرجة من نصّ المادة الحالية + سنواتها
  const info = useMemo(() => extractAmendments(content), [content]);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (versions === null) {
      setLoading(true);
      try {
        if (await offlineReady()) {
          setVersions(
            (await clientVersions(lawId, articleNumber)) as unknown as ArticleVersion[],
          );
        } else {
          const res = await fetch("/api/versions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ law_id: lawId, article_number: articleNumber }),
          });
          const data = await res.json();
          setVersions((data.versions as ArticleVersion[]) || []);
        }
      } catch {
        setVersions([]);
      } finally {
        setLoading(false);
      }
    }
  }

  // لا نعرض اللوحة إن لا تعديل ولا نسخ متعددة
  if (info.notes.length === 0 && (versions === null || versions.length < 2)) {
    // نعرض الزرّ فقط إن كان هناك ملاحظة تعديل
    if (info.notes.length === 0) return null;
  }

  // نقرن كل ملاحظة بسنتها (إن وُجدت)
  const timeline = info.notes.map((note) => {
    const ys = [...note.matchAll(/(?:19|20)\d{2}/g)].map((m) => Number(m[0]));
    const year = ys.length ? Math.max(...ys) : null;
    return {
      note,
      year,
      unrecognized: year != null && year > 2014,
    };
  });

  return (
    <div className="mt-3 border-t border-border pt-3">
      <button
        onClick={toggle}
        className="text-xs font-medium text-accent hover:underline"
      >
        {open ? "▾ إخفاء التعديلات والمقارنة" : "⚖ التعديلات والمقارنة"}
      </button>
      {open && (
        <div className="mt-3 space-y-4">
          {/* الخط الزمني */}
          {timeline.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-muted mb-2">
                خط التعديلات الزمني
              </h4>
              <ol className="relative border-s-2 border-border ms-2 space-y-3">
                {timeline
                  .slice()
                  .sort((a, b) => (a.year ?? 0) - (b.year ?? 0))
                  .map((t, i) => (
                    <li key={i} className="ms-4">
                      <span
                        className={`absolute -start-[7px] w-3 h-3 rounded-full ${
                          t.unrecognized ? "bg-red-600" : "bg-primary"
                        }`}
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold">
                          {t.year ?? "—"}
                        </span>
                        {t.unrecognized && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-600 text-white">
                            غير معترف به
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted leading-6">{t.note}</p>
                    </li>
                  ))}
              </ol>
            </div>
          )}

          {/* مقارنة النسخ */}
          {loading && <p className="text-xs text-muted">جارٍ تحميل النسخ…</p>}
          {versions && versions.length >= 2 && (
            <div>
              <h4 className="text-xs font-bold text-muted mb-2">
                مقارنة النسخ ({versions.length})
              </h4>
              <div className="grid sm:grid-cols-2 gap-3">
                {versions.map((v, i) => {
                  const unrec = v.amend_status === "unrecognized";
                  return (
                    <div
                      key={v.article_id}
                      className={`rounded-xl border p-3 ${
                        unrec
                          ? "border-red-400 bg-red-50 dark:bg-red-950/30"
                          : "border-border bg-background/40"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-xs font-bold">
                          النسخة {i + 1}
                        </span>
                        {unrec ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-600 text-white">
                            ⚠ معدّلة بعد 2014 — غير معترف بها
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                            {v.amend_note ? "معدّلة (معترف بها)" : "النص الأصلي"}
                          </span>
                        )}
                      </div>
                      <p className="text-xs leading-7">
                        <ArticleText
                          content={v.content}
                          lawId={lawId}
                          onRef={onRef}
                        />
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {versions && versions.length < 2 && !loading && (
            <p className="text-xs text-muted">
              لا تتوفّر نسخة سابقة للمقارنة؛ يظهر التعديل موضّحاً داخل النص أعلاه.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// قائمة «المواد المشابهة» — تُحمَّل عند الطلب
function SimilarArticles({
  articleId,
  onRef,
}: {
  articleId: number;
  onRef: (lawId: number, num: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ArticleFull[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (items === null) {
      setLoading(true);
      try {
        if (await offlineReady()) {
          setItems((await clientSimilar(articleId, 5)) as unknown as ArticleFull[]);
        } else {
          const res = await fetch("/api/similar", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ article_id: articleId, limit: 5 }),
          });
          const data = await res.json();
          setItems((data.similar as ArticleFull[]) || []);
        }
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      <button
        onClick={toggle}
        className="text-xs font-medium text-accent hover:underline"
      >
        {open ? "▾ إخفاء المواد المشابهة" : "▸ مواد مشابهة"}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {loading && <p className="text-xs text-muted">جارٍ البحث…</p>}
          {items && items.length === 0 && !loading && (
            <p className="text-xs text-muted">لا توجد مواد مشابهة كافية بعد.</p>
          )}
          {items?.map((it) => (
            <div
              key={it.article_id}
              className="rounded-xl border border-border p-3 bg-background/40"
            >
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-xs font-bold text-primary">
                  {it.law_title}
                </span>
                {it.article_number && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                    المادة ({it.article_number})
                  </span>
                )}
              </div>
              <p className="text-xs text-muted leading-6 line-clamp-3">
                <ArticleText
                  content={it.content}
                  lawId={it.law_id}
                  onRef={onRef}
                />
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// بطاقة «مادة اليوم» — تُعرض في الحالة الفارغة
function ArticleOfDay({
  onRead,
  speakingId,
  onRef,
}: {
  onRead: (h: { article_id: number; content: string }) => void;
  speakingId: number | null;
  onRef: (lawId: number, num: string) => void;
}) {
  const [art, setArt] = useState<DailyArticle | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (await offlineReady()) {
          const a = await clientArticleOfDay();
          if (alive) setArt(a ? (a as unknown as DailyArticle) : null);
        } else {
          const r = await fetch("/api/article-of-day");
          const d = await r.json();
          if (alive) setArt(d.article ?? null);
        }
      } catch {
        /* تجاهل */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!art) return null;

  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-bold text-accent">📌 مادة اليوم</span>
        <span className="text-xs text-muted">تتجدّد يومياً</span>
      </div>
      <article className="bg-surface border border-border rounded-2xl p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="text-sm font-bold text-primary">
            {art.law_title}
          </span>
          {art.article_number && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
              المادة ({art.article_number})
            </span>
          )}
          {art.amend_status === "unrecognized" && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-600 text-white font-medium">
              ⚠ تعديل بعد 2014
            </span>
          )}
          <button
            onClick={() => onRead(art)}
            className={`ms-auto text-xs px-2.5 py-1 rounded-lg border transition-colors ${
              speakingId === art.article_id
                ? "border-primary text-primary"
                : "border-border hover:border-primary hover:text-primary"
            }`}
          >
            {speakingId === art.article_id ? "■ إيقاف" : "🔊 اقرأ"}
          </button>
        </div>
        <div className="legal-text text-[15px] leading-8">
          <ArticleText content={art.content} lawId={art.law_id} onRef={onRef} />
        </div>
      </article>
    </section>
  );
}

// لوحة إعداد الذكاء الاصطناعي بمفتاح المستخدم (BYOK) + دليل عربي
function AiSettings({
  apiKey,
  onSave,
  onClose,
}: {
  apiKey: string;
  onSave: (k: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(apiKey);
  const [show, setShow] = useState(false);
  const valid = draft.trim().startsWith("sk-ant-");

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-2xl shadow-xl max-w-lg w-full my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-lg font-bold text-primary">الذكاء الاصطناعي</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-border text-muted hover:text-foreground hover:border-primary transition-colors"
            aria-label="إغلاق"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4 text-sm leading-7">
          <p className="text-muted">
            التطبيق <strong className="text-foreground">مجاني بالكامل</strong>:
            البحث الدلالي والحاسبات تعمل بلا أي مفتاح. ميزة «اسأل الذكاء الاصطناعي»
            وحدها تحتاج مفتاح <strong>Claude</strong> خاصّاً بك، تدفع مقابله مباشرةً
            لشركة Anthropic حسب استخدامك (التطبيق لا يأخذ شيئاً).
          </p>

          {/* حقل المفتاح */}
          <div>
            <label className="block text-xs font-bold text-muted mb-1.5">
              مفتاح Claude API الخاص بك
            </label>
            <div className="flex gap-2">
              <input
                type={show ? "text" : "password"}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="sk-ant-api03-..."
                dir="ltr"
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary text-left"
              />
              <button
                onClick={() => setShow((s) => !s)}
                className="px-3 rounded-lg border border-border text-muted hover:text-foreground"
                aria-label="إظهار/إخفاء"
              >
                {show ? "🙈" : "👁"}
              </button>
            </div>
            {draft.trim() && !valid && (
              <p className="text-xs text-amber-600 mt-1.5">
                المفتاح يبدأ عادةً بـ <code dir="ltr">sk-ant-</code> — تحقّق من نسخه كاملاً.
              </p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-muted">
                🔒 يُحفظ على جهازك فقط (لا يُرسَل إلا إلى Claude عند طرح سؤال).
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                onSave(draft);
                onClose();
              }}
              disabled={!draft.trim()}
              className="px-4 py-2 rounded-lg bg-primary text-white font-medium hover:bg-primary-strong disabled:opacity-50 transition-colors"
            >
              حفظ وتفعيل
            </button>
            {apiKey && (
              <button
                onClick={() => {
                  onSave("");
                  setDraft("");
                  onClose();
                }}
                className="px-4 py-2 rounded-lg border border-red-300 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
              >
                حذف المفتاح
              </button>
            )}
          </div>

          {/* الدليل خطوة بخطوة */}
          <details className="rounded-xl border border-border bg-background/40 p-3">
            <summary className="cursor-pointer font-bold text-accent text-sm">
              كيف أحصل على مفتاح Claude؟ (دليل بالخطوات)
            </summary>
            <ol className="mt-3 space-y-2.5 ps-1">
              <li>
                <span className="font-bold text-primary">1)</span> افتح موقع{" "}
                <a
                  href="https://console.anthropic.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline"
                  dir="ltr"
                >
                  console.anthropic.com
                </a>{" "}
                وأنشئ حساباً (أو سجّل الدخول).
              </li>
              <li>
                <span className="font-bold text-primary">2)</span> من القائمة
                اذهب إلى <strong>Billing</strong> وأضف رصيداً بسيطاً (مثلاً 5 دولار)
                ببطاقة — الاستخدام يُخصَم بالقدر الفعلي وهو زهيد جداً للأسئلة.
              </li>
              <li>
                <span className="font-bold text-primary">3)</span> اذهب إلى{" "}
                <strong>API Keys</strong> ← <strong>Create Key</strong>، وسمّ
                المفتاح كما تشاء.
              </li>
              <li>
                <span className="font-bold text-primary">4)</span> انسخ المفتاح
                الظاهر (يبدأ بـ <code dir="ltr">sk-ant-</code>) فوراً — لن يظهر
                ثانيةً بعد إغلاق النافذة.
              </li>
              <li>
                <span className="font-bold text-primary">5)</span> الصقه في الحقل
                أعلاه واضغط <strong>«حفظ وتفعيل»</strong>. تمّ — اسأل ما تشاء.
              </li>
            </ol>
            <p className="text-xs text-muted mt-3">
              مفتاحك يبقى ملكك وحدك ومحفوظاً على هذا الجهاز. يمكنك حذفه من هنا في
              أي وقت، أو إلغاؤه من لوحة Anthropic.
            </p>
          </details>
        </div>
      </div>
    </div>
  );
}

type Mode = "search" | "ask" | "browse";

interface LawMeta {
  id: number;
  title: string;
  law_number: string | null;
  year: string | null;
  category: string | null;
  article_count: number;
}

// ترتيب التصنيفات وتسمياتها في شريط التصفية
const CAT_TABS: { key: string; label: string }[] = [
  { key: "all", label: "الكل" },
  { key: "دستور", label: "الدستور" },
  { key: "قانون", label: "قوانين" },
  { key: "لائحة", label: "لوائح" },
  { key: "حكم", label: "أحكام" },
];

// فصل عنوان المادة عن مسار القسم (المحفوظ بعد « — » أثناء الفهرسة)
function splitHeading(heading: string | null): {
  label: string;
  section: string | null;
} {
  if (!heading) return { label: "", section: null };
  const i = heading.indexOf(" — ");
  if (i === -1) return { label: heading, section: null };
  return { label: heading.slice(0, i), section: heading.slice(i + 3).trim() };
}

// تجميل مسار القسم: فصل المستويات (كتاب/قسم/باب/فصل…) بفاصل بصري
const SECTION_SPLIT = /\s+(?=(?:الكتاب|القسم|الباب|الفصل|الفرع|المبحث|الجزء|الباب)\s)/;
function prettySection(s: string): string {
  const parts = s.split(SECTION_SPLIT).map((x) => x.trim()).filter(Boolean);
  return parts.length > 1 ? parts.join("  ‹  ") : s;
}

// وضع التصفّح: مكتبة كاملة — تصفّح الوثائق وقراءة موادها بالترتيب ككتاب
function LawLibrary({
  onRef,
  onSpeak,
  onShare,
  onCopy,
  speakingId,
  copiedId,
}: {
  onRef: (lawId: number, num: string) => void;
  onSpeak: (h: { article_id: number; content: string }) => void;
  onShare: (h: SearchHit) => void;
  onCopy: (h: SearchHit) => void;
  speakingId: number | null;
  copiedId: number | null;
}) {
  const [laws, setLaws] = useState<LawMeta[] | null>(null);
  const [filter, setFilter] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [selected, setSelected] = useState<LawMeta | null>(null);
  const [articles, setArticles] = useState<ArticleFull[] | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [artQuery, setArtQuery] = useState(""); // بحث داخل الوثيقة برقم المادة أو كلمة
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set()); // أقسام مطويّة
  const [highlightId, setHighlightId] = useState<number | null>(null); // المادة المُبرَزة

  // إزالة الإبراز تلقائياً بعد ثانيتين
  useEffect(() => {
    if (highlightId == null) return;
    const t = setTimeout(() => setHighlightId(null), 2200);
    return () => clearTimeout(t);
  }, [highlightId]);

  // تحميل قائمة الوثائق مرّة واحدة
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        let list: LawMeta[];
        if (await offlineReady()) {
          list = (await clientLawList()) as LawMeta[];
        } else {
          const res = await fetch("/api/laws");
          const data = await res.json();
          list = (data.laws as LawMeta[]) || [];
        }
        if (alive) setLaws(list);
      } catch {
        if (alive) setErr("تعذّر تحميل قائمة الوثائق");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function openLaw(l: LawMeta) {
    setSelected(l);
    setArticles(null);
    setArtQuery("");
    setCollapsed(new Set());
    setHighlightId(null);
    setLoadingDoc(true);
    window.scrollTo({ top: 0 });
    try {
      if (await offlineReady()) {
        setArticles((await clientLawArticles(l.id)) as unknown as ArticleFull[]);
      } else {
        const res = await fetch("/api/law", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ law_id: l.id }),
        });
        const data = await res.json();
        setArticles((data.articles as ArticleFull[]) || []);
      }
    } catch {
      setArticles([]);
    } finally {
      setLoadingDoc(false);
    }
  }

  function back() {
    setSelected(null);
    setArticles(null);
  }

  // عدّ الوثائق لكل تصنيف (لعرضه على الألسنة)
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, دستور: 0, قانون: 0, لائحة: 0, حكم: 0 };
    for (const l of laws ?? []) {
      c.all++;
      const k = l.category ?? "قانون";
      if (c[k] != null) c[k]++;
    }
    return c;
  }, [laws]);

  const shown = useMemo(() => {
    const q = normalizeAr(filter);
    return (laws ?? []).filter((l) => {
      const lcat = l.category ?? "قانون";
      if (cat !== "all" && lcat !== cat) return false;
      if (!q) return true;
      return normalizeAr(`${l.title} ${l.law_number ?? ""} ${l.year ?? ""}`).includes(q);
    });
  }, [laws, filter, cat]);

  // ——— عرض وثيقة واحدة (قراءة ككتاب) ———
  if (selected) {
    // بحث داخل الوثيقة: رقم خالص ⇒ مطابقة رقم المادة بالضبط، وإلا بحث نصّي
    const raw = artQuery.trim();
    const isNum = /^[\d٠-٩]+$/.test(raw);
    const qDigits = toLatinDigits(raw);
    const qNorm = normalizeAr(raw);
    const docArticles = (articles ?? []).filter((a) => {
      if (!raw) return true;
      if (isNum) {
        return (
          a.article_number != null &&
          toLatinDigits(a.article_number) === qDigits
        );
      }
      return normalizeAr(`${a.heading ?? ""} ${a.content}`).includes(qNorm);
    });

    // تجميع المواد في أقسام متتالية (باب/فصل) لطيّها وفهرستها
    const groups: { key: number; section: string | null; items: ArticleFull[] }[] = [];
    for (const a of docArticles) {
      const { section } = splitHeading(a.heading);
      const last = groups[groups.length - 1];
      if (last && last.section === section) last.items.push(a);
      else groups.push({ key: groups.length, section, items: [a] });
    }
    const sectionGroups = groups.filter((g) => g.section);
    const articleGroupKey = new Map<number, number>();
    for (const g of groups) for (const a of g.items) articleGroupKey.set(a.article_id, g.key);
    const allCollapsed =
      sectionGroups.length > 0 && sectionGroups.every((g) => collapsed.has(g.key));

    const toggleGroup = (key: number) =>
      setCollapsed((prev) => {
        const n = new Set(prev);
        if (n.has(key)) n.delete(key);
        else n.add(key);
        return n;
      });
    const expandAll = () => setCollapsed(new Set());
    const collapseAll = () =>
      setCollapsed(new Set(sectionGroups.map((g) => g.key)));

    // الانتقال لمادة: نفتح قسمها إن كان مطويّاً، نُبرزها، ثم نمرّر إليها
    const goToArticle = (id: number) => {
      const gk = articleGroupKey.get(id);
      if (gk != null && collapsed.has(gk)) {
        setCollapsed((prev) => {
          const n = new Set(prev);
          n.delete(gk);
          return n;
        });
      }
      setHighlightId(id);
      setTimeout(
        () =>
          document
            .getElementById(`art-${id}`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" }),
        50,
      );
    };

    const jumpToGroup = (key: number) => {
      if (collapsed.has(key)) {
        setCollapsed((prev) => {
          const n = new Set(prev);
          n.delete(key);
          return n;
        });
      }
      const first = groups.find((g) => g.key === key)?.items[0];
      if (first) setHighlightId(first.article_id);
      setTimeout(
        () =>
          document
            .getElementById(`sec-${key}`)
            ?.scrollIntoView({ behavior: "smooth", block: "start" }),
        50,
      );
    };

    // المادة السابقة/التالية اعتماداً على أقرب مادة لأعلى الشاشة حالياً
    const gotoSibling = (dir: 1 | -1) => {
      if (docArticles.length === 0) return;
      let cur = 0;
      for (let i = 0; i < docArticles.length; i++) {
        const el = document.getElementById(`art-${docArticles[i].article_id}`);
        if (el && el.getBoundingClientRect().top <= 140) cur = i;
      }
      const next = Math.min(Math.max(cur + dir, 0), docArticles.length - 1);
      goToArticle(docArticles[next].article_id);
    };

    // بطاقة مادة واحدة (مُعاد استخدامها في وضعي التصفّح والبحث الداخلي)
    const renderArticle = (a: ArticleFull) => {
      const hit: SearchHit = { ...a, score: 1, matched_keyword: false };
      const { label } = splitHeading(a.heading);
      return (
        <article
          key={a.article_id}
          id={`art-${a.article_id}`}
          className={`scroll-mt-4 bg-surface border rounded-2xl p-5 shadow-sm transition-colors ${
            highlightId === a.article_id
              ? "border-accent ring-2 ring-accent/60"
              : "border-border"
          }`}
        >
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {label && (
              <span className="text-sm font-bold text-primary">{label}</span>
            )}
            {a.amend_status === "unrecognized" && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-600 text-white font-medium">
                ⚠ تعديل بعد 2014 — غير معترف به
              </span>
            )}
            {a.amend_status === "recognized" && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400">
                يتضمّن تعديلاً
              </span>
            )}
            <div className="ms-auto flex items-center gap-1.5">
              <button
                onClick={() => onSpeak(a)}
                title={speakingId === a.article_id ? "إيقاف" : "اقرأ لي"}
                className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                  speakingId === a.article_id
                    ? "border-primary text-primary"
                    : "border-border hover:border-primary hover:text-primary"
                }`}
              >
                {speakingId === a.article_id ? "■ إيقاف" : "🔊 اقرأ"}
              </button>
              <button
                onClick={() => onShare(hit)}
                title="مشاركة"
                className="text-xs px-2.5 py-1 rounded-lg border border-border hover:border-primary hover:text-primary transition-colors"
              >
                ↗ مشاركة
              </button>
              <button
                onClick={() => onCopy(hit)}
                title="نسخ المادة مع العزو"
                className="text-xs px-2.5 py-1 rounded-lg border border-border hover:border-primary hover:text-primary transition-colors"
              >
                {copiedId === a.article_id ? <>✓ تم النسخ</> : <>⧉ نسخ</>}
              </button>
            </div>
          </div>
          <div className="legal-text text-[15px] leading-8">
            <ArticleText content={a.content} lawId={a.law_id} onRef={onRef} />
          </div>
          {a.amend_status === "unrecognized" && (
            <p className="mt-3 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg p-2">
              ⚠ هذه المادة تتضمّن تعديلاً مؤرّخاً سنة {a.amend_year} (بعد 2014)،
              وهو غير معترف به. يُرجى الرجوع إلى النص الأصلي قبل ٢٠١٤.
            </p>
          )}
        </article>
      );
    };

    return (
      <section>
        <button
          onClick={back}
          className="text-sm text-primary hover:underline mb-3 inline-flex items-center gap-1"
        >
          ← رجوع إلى المكتبة
        </button>
        <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-foreground">{selected.title}</h2>
            <DocTypeBadge category={selected.category} />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted">
            {selected.law_number && <span>رقم ({selected.law_number})</span>}
            {selected.year && <span>لسنة {selected.year}م</span>}
            <span>{selected.article_count} مادة</span>
          </div>
        </div>

        {/* بحث داخل الوثيقة برقم المادة (أو كلمة في النص) */}
        {articles && articles.length > 0 && (
          <div className="relative mb-4">
            <input
              value={artQuery}
              onChange={(e) => setArtQuery(e.target.value)}
              inputMode="search"
              placeholder="اذهب إلى مادة برقمها… (مثال: 15) أو ابحث بكلمة"
              className="w-full bg-surface border border-border rounded-xl px-4 py-2.5 text-base outline-none focus:border-primary"
            />
            {raw && (
              <button
                onClick={() => setArtQuery("")}
                aria-label="مسح"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground text-lg"
              >
                ×
              </button>
            )}
          </div>
        )}

        {/* فهرس الأبواب والفصول + طيّ/فتح الكل */}
        {!raw && sectionGroups.length > 1 && (
          <div className="mb-4 space-y-2">
            <details className="bg-surface border border-border rounded-2xl overflow-hidden">
              <summary className="cursor-pointer select-none px-5 py-3 text-sm font-bold text-primary">
                📑 فهرس الأبواب والفصول ({sectionGroups.length})
              </summary>
              <ol className="border-t border-border divide-y divide-border max-h-80 overflow-y-auto">
                {sectionGroups.map((g) => (
                  <li key={g.key}>
                    <button
                      onClick={() => jumpToGroup(g.key)}
                      className="w-full text-right px-5 py-2.5 text-sm hover:bg-primary/5 transition-colors flex items-start gap-2"
                    >
                      <span className="flex-1 leading-6">
                        {prettySection(g.section!)}
                      </span>
                      {g.items[0]?.article_number && (
                        <span className="text-xs text-muted whitespace-nowrap mt-0.5">
                          من المادة {g.items[0].article_number}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ol>
            </details>
            <button
              onClick={allCollapsed ? expandAll : collapseAll}
              className="text-xs text-muted hover:text-primary underline"
            >
              {allCollapsed ? "فتح كل الأبواب" : "طيّ كل الأبواب"}
            </button>
          </div>
        )}

        {loadingDoc && (
          <p className="text-center text-muted py-10">جارٍ تحميل المواد…</p>
        )}

        {articles && articles.length === 0 && !loadingDoc && (
          <p className="text-center text-muted py-10">لا توجد مواد لهذه الوثيقة.</p>
        )}

        {articles && articles.length > 0 && raw && (
          <p className="text-sm text-muted mb-3">
            {docArticles.length > 0
              ? `${docArticles.length} نتيجة${isNum ? ` للمادة رقم ${qDigits}` : ""}`
              : isNum
                ? `لا توجد مادة بالرقم ${qDigits} في هذه الوثيقة.`
                : "لا توجد مادة مطابقة."}
          </p>
        )}

        {/* وضع البحث الداخلي: قائمة مسطّحة. وضع التصفّح: أقسام قابلة للطيّ */}
        {raw ? (
          <div className="space-y-3">{docArticles.map(renderArticle)}</div>
        ) : (
          <div className="space-y-3">
            {groups.map((g) => {
              if (!g.section) {
                return (
                  <Fragment key={g.key}>{g.items.map(renderArticle)}</Fragment>
                );
              }
              const isCollapsed = collapsed.has(g.key);
              return (
                <div key={g.key} className="space-y-3">
                  <button
                    id={`sec-${g.key}`}
                    onClick={() => toggleGroup(g.key)}
                    className="scroll-mt-4 w-full text-right flex items-start gap-2 pt-2 pb-1 px-1 text-sm font-bold text-accent leading-7 border-b border-accent/30"
                  >
                    <span className="mt-0.5">{isCollapsed ? "▸" : "▾"}</span>
                    <span className="flex-1">{prettySection(g.section)}</span>
                    <span className="text-xs text-muted font-normal whitespace-nowrap mt-1">
                      {g.items.length} مادة
                    </span>
                  </button>
                  {!isCollapsed && g.items.map(renderArticle)}
                </div>
              );
            })}
          </div>
        )}

        {/* شريط تنقّل عائم: السابقة / أعلى / التالية */}
        {articles && articles.length > 0 && !loadingDoc && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 bg-surface/95 backdrop-blur border border-border rounded-full shadow-lg px-2 py-1.5">
            <button
              onClick={() => gotoSibling(-1)}
              title="المادة السابقة"
              className="px-3 py-1.5 rounded-full text-sm hover:bg-primary/10 text-foreground"
            >
              ‹ السابقة
            </button>
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              title="إلى الأعلى/الفهرس"
              className="px-3 py-1.5 rounded-full text-sm hover:bg-primary/10 text-muted"
            >
              ↑ أعلى
            </button>
            <button
              onClick={() => gotoSibling(1)}
              title="المادة التالية"
              className="px-3 py-1.5 rounded-full text-sm hover:bg-primary/10 text-foreground"
            >
              التالية ›
            </button>
          </div>
        )}
      </section>
    );
  }

  // ——— قائمة المكتبة ———
  return (
    <section>
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="ابحث باسم القانون أو اللائحة…"
        className="w-full bg-surface border border-border rounded-xl px-4 py-2.5 text-base outline-none focus:border-primary mb-3"
      />
      <div className="inline-flex flex-wrap gap-1 rounded-xl border border-border bg-surface p-1 mb-4">
        {CAT_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setCat(t.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              cat === t.key
                ? "bg-primary text-white"
                : "text-muted hover:text-foreground"
            }`}
          >
            {t.label}
            <span className="opacity-70"> ({counts[t.key] ?? 0})</span>
          </button>
        ))}
      </div>

      {err && <p className="text-center text-red-600 py-6">{err}</p>}
      {!laws && !err && (
        <p className="text-center text-muted py-10">جارٍ تحميل المكتبة…</p>
      )}
      {laws && shown.length === 0 && (
        <p className="text-center text-muted py-10">لا توجد وثائق مطابقة.</p>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {shown.map((l) => (
          <button
            key={l.id}
            onClick={() => openLaw(l)}
            className="text-right bg-surface border border-border rounded-xl p-4 shadow-sm hover:border-primary transition-colors"
          >
            <div className="flex items-start gap-2">
              <span className="text-sm font-bold text-foreground flex-1">
                {l.title}
              </span>
              <DocTypeBadge category={l.category} />
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs text-muted">
              {l.law_number && <span>رقم ({l.law_number})</span>}
              {l.year && <span>لسنة {l.year}م</span>}
              <span>{l.article_count} مادة</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("search");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<AskSource[]>([]);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [listening, setListening] = useState(false);
  const [speakingId, setSpeakingId] = useState<number | null>(null);
  const [refArticle, setRefArticle] = useState<ArticleFull | null>(null);
  const [refLoading, setRefLoading] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [showAi, setShowAi] = useState(false);

  // تحميل مفتاح المستخدم المحفوظ محلياً (BYOK) عند الإقلاع
  useEffect(() => {
    try {
      const saved = localStorage.getItem("yl_claude_key");
      if (saved) setApiKey(saved);
    } catch {
      /* تجاهل */
    }
  }, []);

  function saveApiKey(k: string) {
    const v = k.trim();
    setApiKey(v);
    try {
      if (v) localStorage.setItem("yl_claude_key", v);
      else localStorage.removeItem("yl_claude_key");
    } catch {
      /* تجاهل */
    }
  }

  // فتح مادة مُحال إليها داخل نفس القانون (نافذة منبثقة)
  async function openRef(lawId: number, num: string) {
    setRefLoading(true);
    setRefArticle(null);
    try {
      if (await offlineReady()) {
        const a = await clientArticle(lawId, num);
        setRefArticle(a ? (a as unknown as ArticleFull) : null);
      } else {
        const res = await fetch("/api/article", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ law_id: lawId, article_number: num }),
        });
        const data = await res.json();
        if (data.article) setRefArticle(data.article as ArticleFull);
        else setRefArticle(null);
      }
    } catch {
      setRefArticle(null);
    } finally {
      setRefLoading(false);
    }
  }
  function closeRef() {
    setRefArticle(null);
    setRefLoading(false);
  }

  // البحث الصوتي عبر Web Speech API
  function startVoice() {
    const w = window as unknown as {
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
      SpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Rec = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Rec) {
      setError("البحث الصوتي غير مدعوم في هذا المتصفّح");
      return;
    }
    const rec = new Rec();
    rec.lang = "ar-SA";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e) => {
      const text = e.results[0]?.[0]?.transcript ?? "";
      if (text) setQuery(text);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    setError(null);
    setListening(true);
    rec.start();
  }

  // القراءة الصوتية لنص المادة (TTS) — مع إمكانية الإيقاف
  function speakArticle(h: { article_id: number; content: string }) {
    if (!("speechSynthesis" in window)) {
      setError("القراءة الصوتية غير مدعومة في هذا المتصفّح");
      return;
    }
    if (speakingId === h.article_id) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(plainArticleText(h.content));
    u.lang = "ar-SA";
    u.rate = 0.95;
    u.onend = () => setSpeakingId((id) => (id === h.article_id ? null : id));
    setSpeakingId(h.article_id);
    window.speechSynthesis.speak(u);
  }

  // مشاركة المادة مع العزو عبر Web Share API (مع تراجع إلى النسخ)
  async function shareArticle(h: SearchHit) {
    const warn =
      h.amend_status === "unrecognized"
        ? `\n⚠ يتضمّن تعديلاً سنة ${h.amend_year} (بعد 2014) غير معترف به.`
        : "";
    const text = `${plainArticleText(h.content)}\n\n— المصدر: ${buildCitation(h)}.${warn}\nعبر تطبيق Yemeni Laws`;
    const nav = navigator as Navigator & {
      share?: (d: { title?: string; text?: string }) => Promise<void>;
    };
    if (nav.share) {
      try {
        await nav.share({ title: buildCitation(h), text });
      } catch {
        /* أُلغيت المشاركة */
      }
    } else {
      await copyArticle(h);
    }
  }

  // نسخ نص المادة مع عزو تلقائي للمصدر في نهايته
  async function copyArticle(h: SearchHit) {
    const warn =
      h.amend_status === "unrecognized"
        ? `\n⚠ يتضمّن تعديلاً سنة ${h.amend_year} (بعد 2014) غير معترف به.`
        : "";
    const text = `${h.content}\n\n— المصدر: ${buildCitation(h)}.${warn}\nعبر تطبيق Yemeni Laws`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(h.article_id);
      setTimeout(() => setCopiedId((id) => (id === h.article_id ? null : id)), 2000);
    } catch {
      setError("تعذّر النسخ في هذا المتصفّح");
    }
  }

  async function run() {
    const q = query.trim();
    if (!q) return;
    // وضع السؤال الذكي يتطلّب مفتاح المستخدم — نفتح الإعداد إن لم يوجد
    if (mode === "ask" && !apiKey.trim()) {
      setShowAi(true);
      return;
    }
    setLoading(true);
    setError(null);
    setHits(null);
    setAnswer(null);
    setSources([]);

    try {
      if (mode === "search") {
        // الوضع المحلي (offline) إن توفّرت الحزمة، وإلا الخادم
        if (await offlineReady()) {
          setHits((await clientSearch(q, 20)) as SearchHit[]);
        } else {
          const res = await fetch("/api/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: q, limit: 20 }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "تعذّر البحث");
          setHits(data.hits as SearchHit[]);
        }
      } else {
        // السؤال الذكي يجري بالكامل في المتصفّح: استرجاع محلي + اتصال مباشر بـ Claude
        const data = await clientAsk(q, apiKey.trim());
        setAnswer(data.answer);
        setSources((data.sources as AskSource[]) || []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      run();
    }
  }

  return (
    <div className="flex flex-col min-h-full">
      <header className="border-b border-border bg-surface">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-primary tracking-tight" dir="ltr">
              Yemeni Laws
            </h1>
            <p className="text-xs sm:text-sm text-muted mt-1">
              القوانين اليمنية — بحث دلالي وإجابات ذكية
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAi(true)}
              className={`text-sm px-3 py-2 rounded-lg border transition-colors whitespace-nowrap ${
                apiKey
                  ? "border-primary text-primary"
                  : "border-border hover:border-primary hover:text-primary"
              }`}
              title="إعداد الذكاء الاصطناعي بمفتاحك الخاص"
            >
              {apiKey ? "🤖 الذكاء مُفعّل" : "🤖 الذكاء الاصطناعي"}
            </button>
            <Link
              href="/tools"
              className="text-sm px-3 py-2 rounded-lg border border-border hover:border-primary hover:text-primary transition-colors whitespace-nowrap"
            >
              الحاسبات
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-6">
        {/* مبدّل الوضع */}
        <div className="inline-flex rounded-xl border border-border bg-surface p-1 mb-4">
          <button
            onClick={() => setMode("search")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === "search"
                ? "bg-primary text-white"
                : "text-muted hover:text-foreground"
            }`}
          >
            بحث دلالي
          </button>
          <button
            onClick={() => setMode("ask")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === "ask"
                ? "bg-primary text-white"
                : "text-muted hover:text-foreground"
            }`}
          >
            اسأل الذكاء الاصطناعي
          </button>
          <button
            onClick={() => setMode("browse")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === "browse"
                ? "bg-primary text-white"
                : "text-muted hover:text-foreground"
            }`}
          >
            📚 تصفّح المكتبة
          </button>
        </div>

        {mode === "browse" ? (
          <LawLibrary
            onRef={openRef}
            onSpeak={speakArticle}
            onShare={shareArticle}
            onCopy={copyArticle}
            speakingId={speakingId}
            copiedId={copiedId}
          />
        ) : (
          <>
        {/* صندوق الإدخال */}
        <div className="bg-surface border border-border rounded-2xl p-3 shadow-sm">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            rows={mode === "ask" ? 3 : 2}
            placeholder={
              mode === "search"
                ? "اكتب موضوعاً أو سؤالاً للبحث في نصوص المواد… (مثال: عقوبة السرقة)"
                : "اطرح سؤالك القانوني وسيجيب الذكاء الاصطناعي اعتماداً على نصوص القوانين…"
            }
            className="w-full resize-none bg-transparent outline-none p-2 text-base placeholder:text-muted"
          />
          <div className="flex items-center justify-between mt-2 px-1">
            <div className="flex items-center gap-2">
              <button
                onClick={startVoice}
                title="بحث صوتي"
                aria-label="بحث صوتي"
                className={`w-9 h-9 rounded-lg border flex items-center justify-center transition-colors ${
                  listening
                    ? "border-red-500 text-red-500 animate-pulse"
                    : "border-border text-muted hover:border-primary hover:text-primary"
                }`}
              >
                🎙
              </button>
              <span className="text-xs text-muted">
                {listening ? "أتحدّث… تكلّم الآن" : "Ctrl + Enter للإرسال"}
              </span>
            </div>
            <button
              onClick={run}
              disabled={loading || !query.trim()}
              className="px-5 py-2 rounded-lg bg-primary text-white font-medium hover:bg-primary-strong disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading
                ? "جارٍ المعالجة…"
                : mode === "search"
                  ? "بحث"
                  : "اسأل"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-4 rounded-xl border border-red-300 bg-red-50 text-red-800 text-sm dark:bg-red-950/40 dark:border-red-800 dark:text-red-200">
            {error}
          </div>
        )}

        {/* إجابة الذكاء الاصطناعي */}
        {answer && (
          <section className="mt-6">
            <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm">
              <h2 className="text-sm font-bold text-accent mb-3">الإجابة</h2>
              <div className="legal-text text-[15px] leading-8">{answer}</div>
            </div>
            {sources.length > 0 && (
              <div className="mt-3">
                <h3 className="text-xs font-bold text-muted mb-2">
                  المواد المرجعية المستخدمة
                </h3>
                <div className="flex flex-wrap gap-2">
                  {sources.map((s) => (
                    <span
                      key={s.article_id}
                      className="text-xs px-3 py-1.5 rounded-full bg-surface border border-border text-muted"
                    >
                      {s.law_title}
                      {s.article_number ? ` — مادة (${s.article_number})` : ""}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <p className="text-xs text-muted mt-3">
              ملاحظة: الإجابة استرشادية مبنية على النصوص المرفوعة؛ المرجع النهائي
              هو النص الرسمي للقانون والمختص القانوني.
            </p>
          </section>
        )}

        {/* نتائج البحث */}
        {hits && (
          <section className="mt-6 space-y-3">
            {hits.length === 0 ? (
              <p className="text-center text-muted py-10">
                لا توجد نتائج مطابقة. جرّب صياغة أخرى أو تأكّد من رفع القوانين.
              </p>
            ) : (
              <>
                <p className="text-sm text-muted">
                  {hits.length} نتيجة مرتبطة بسؤالك
                </p>
                {hits.map((h) => (
                  <article
                    key={h.article_id}
                    className="bg-surface border border-border rounded-2xl p-5 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="text-sm font-bold text-primary">
                        {h.law_title}
                      </span>
                      <DocTypeBadge category={h.category} />
                      {h.law_number && (
                        <span className="text-xs text-muted">
                          رقم {h.law_number}
                        </span>
                      )}
                      {h.year && (
                        <span className="text-xs text-muted">لسنة {h.year}</span>
                      )}
                      {h.article_number && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                          المادة ({h.article_number})
                        </span>
                      )}
                      {h.matched_keyword && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-accent/15 text-accent">
                          تطابق لفظي
                        </span>
                      )}
                      {h.amend_status === "unrecognized" && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-600 text-white font-medium">
                          ⚠ تعديل بعد 2014 — غير معترف به
                        </span>
                      )}
                      {h.amend_status === "recognized" && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400">
                          يتضمّن تعديلاً
                        </span>
                      )}
                      <div className="ms-auto flex items-center gap-1.5">
                        <button
                          onClick={() => speakArticle(h)}
                          title={
                            speakingId === h.article_id ? "إيقاف" : "اقرأ لي"
                          }
                          aria-label="اقرأ لي"
                          className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                            speakingId === h.article_id
                              ? "border-primary text-primary"
                              : "border-border hover:border-primary hover:text-primary"
                          }`}
                        >
                          {speakingId === h.article_id ? "■ إيقاف" : "🔊 اقرأ"}
                        </button>
                        <button
                          onClick={() => shareArticle(h)}
                          title="مشاركة"
                          aria-label="مشاركة"
                          className="text-xs px-2.5 py-1 rounded-lg border border-border hover:border-primary hover:text-primary transition-colors"
                        >
                          ↗ مشاركة
                        </button>
                        <button
                          onClick={() => copyArticle(h)}
                          title="نسخ المادة مع العزو"
                          className="text-xs px-2.5 py-1 rounded-lg border border-border hover:border-primary hover:text-primary transition-colors"
                        >
                          {copiedId === h.article_id ? (
                            <>✓ تم النسخ</>
                          ) : (
                            <>⧉ نسخ</>
                          )}
                        </button>
                      </div>
                    </div>
                    <div className="legal-text text-[15px] leading-8">
                      <ArticleText
                        content={h.content}
                        lawId={h.law_id}
                        onRef={openRef}
                      />
                    </div>
                    {h.amend_status === "unrecognized" && (
                      <p className="mt-3 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg p-2">
                        ⚠ هذه المادة تتضمّن تعديلاً مؤرّخاً سنة {h.amend_year} (بعد 2014)،
                        وهو غير معترف به. يُرجى الرجوع إلى النص الأصلي قبل ٢٠١٤.
                      </p>
                    )}
                    {h.amend_note && h.article_number && (
                      <AmendmentPanel
                        lawId={h.law_id}
                        articleNumber={h.article_number}
                        content={h.content}
                        onRef={openRef}
                      />
                    )}
                    <SimilarArticles articleId={h.article_id} onRef={openRef} />
                  </article>
                ))}
              </>
            )}
          </section>
        )}

        {!hits && !answer && !error && !loading && (
          <>
            <ArticleOfDay
              onRead={speakArticle}
              speakingId={speakingId}
              onRef={openRef}
            />
            <div className="text-center text-muted py-10 text-sm">
              ابدأ بكتابة سؤالك في الأعلى. البحث الدلالي والحاسبات يعملان مجاناً
              ومحلياً. لتفعيل «اسأل الذكاء الاصطناعي» أضِف مفتاحك الخاص من زرّ{" "}
              <button
                onClick={() => setShowAi(true)}
                className="text-accent underline"
              >
                🤖 الذكاء الاصطناعي
              </button>
              .
            </div>
          </>
        )}
          </>
        )}
      </main>

      <footer className="border-t border-border text-center text-xs text-muted py-4">
        مكتبة قانونية ذكية — للقوانين اليمنية
      </footer>

      {/* نافذة إعداد الذكاء الاصطناعي */}
      {showAi && (
        <AiSettings
          apiKey={apiKey}
          onSave={saveApiKey}
          onClose={() => setShowAi(false)}
        />
      )}

      {/* نافذة المادة المُحال إليها */}
      {(refLoading || refArticle) && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-3"
          onClick={closeRef}
        >
          <div
            className="bg-surface border border-border rounded-2xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-sm font-bold text-primary flex items-center gap-2">
                <span>
                  {refLoading
                    ? "جارٍ التحميل…"
                    : refArticle
                      ? `${refArticle.law_title}${refArticle.article_number ? ` — المادة (${refArticle.article_number})` : ""}`
                      : ""}
                </span>
                {refArticle && <DocTypeBadge category={refArticle.category} />}
              </h3>
              <button
                onClick={closeRef}
                aria-label="إغلاق"
                className="text-muted hover:text-foreground text-xl leading-none px-2"
              >
                ×
              </button>
            </div>
            {refLoading && (
              <p className="text-sm text-muted">جارٍ جلب نصّ المادة…</p>
            )}
            {!refLoading && refArticle && (
              <>
                {refArticle.amend_status === "unrecognized" && (
                  <span className="inline-block mb-2 text-xs px-2 py-0.5 rounded-full bg-red-600 text-white font-medium">
                    ⚠ تعديل بعد 2014 — غير معترف به
                  </span>
                )}
                <div className="legal-text text-[15px] leading-8">
                  <ArticleText
                    content={refArticle.content}
                    lawId={refArticle.law_id}
                    onRef={openRef}
                  />
                </div>
              </>
            )}
            {!refLoading && !refArticle && (
              <p className="text-sm text-muted">
                تعذّر العثور على المادة المُحال إليها في هذا القانون.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
