"use client";

import { useState, useEffect, useMemo, Fragment } from "react";
import Link from "next/link";
import SiteFooter from "./site-footer";
import AppBottomNav from "./app-bottom-nav";
import { segmentAmendments, extractAmendments } from "@/lib/amendments";
import {
  offlineReady,
  clientSearch,
  clientLiteralSearch,
  clientSimilar,
  clientArticle,
  clientVersions,
  clientArticleOfDay,
  clientLawList,
  clientLawArticles,
  normalizeAr,
} from "@/lib/client-search";
import { clientAsk } from "@/lib/client-ask";
import { assistantAnswer, appKnowledge, type AssistantResult } from "@/lib/client-assistant";
import { nexusChat, type NexusMessage } from "@/lib/nexus-client";
import { geminiChat, geminiExpandQuery } from "@/lib/gemini-client";

const GEMINI_ONLY_BUILD = process.env.NEXT_PUBLIC_GEMINI_ONLY === "1";

// خادم التغذية الراجعة المشتركة (يجمع الأسئلة بلا هوية ويعرض «يسأل الناس»)
const FEEDBACK_URL =
  process.env.NEXT_PUBLIC_FEEDBACK_URL || "https://yl-feedback.vercel.app";

interface CommunityItem {
  q: string;
  count?: number;
}

// تسجيل سؤال بلا هوية (fire-and-forget؛ لا يعطّل التطبيق إن فشل أو كان أوفلاين)
function logCommunityQuestion(q: string, a: string) {
  try {
    fetch(`${FEEDBACK_URL}/api/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: q.slice(0, 500), a: a.slice(0, 2000) }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* تجاهل */
  }
}

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
  amended_text: string | null;
}

// شارة لون لنوع المستند (قانون/لائحة/حكم/نيابة)
function DocTypeBadge({ category }: { category: string | null }) {
  if (!category || category === "قانون") return null;
  const styles: Record<string, string> = {
    لائحة: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    اتفاقية: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400",
    حكم: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
    دستور: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    نيابة: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  };
  const cls = styles[category] || "bg-accent/15 text-accent";
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>
      {category}
    </span>
  );
}

// اسم العرض: نُضيف نوع الوثيقة قبل العنوان (قانون/لائحة) حسب التصنيف
const TITLE_OVERRIDES: Record<string, string> = {
  المدني: "القانون المدني",
  التجاري: "القانون التجاري",
};
function displayLawTitle(title: string | null, category: string | null): string {
  // نُزيل علامات الاتجاه والمسافات الخفية من البداية، ونبقي النص كما هو للعرض
  const t = (title ?? "").replace(/[‎‏‪-‮؜]/g, "").trim();
  if (!t) return t;
  if (t.startsWith("🔴 ")) return `🔴 ${displayLawTitle(t.slice(3), category)}`;
  // نسخة للفحص فقط: بلا تطويل (ـ) لضمان مطابقة البادئة
  const norm = t.replace(/ـ/g, "");
  if (category === "قانون") {
    if (TITLE_OVERRIDES[t]) return TITLE_OVERRIDES[t];
    return norm.startsWith("قانون") || norm.startsWith("القانون") ? t : `قانون ${t}`;
  }
  if (category === "لائحة") {
    return norm.startsWith("لائحة") || norm.startsWith("اللائحة") ? t : `لائحة ${t}`;
  }
  if (category === "حكم") {
    return norm.startsWith("القواعد") || norm.startsWith("قواعد") ? t : `القواعد ${t}`;
  }
  // دستور/نيابة: العنوان كما هو (وصفي أصلاً)
  return t;
}

// بناء عزو قانوني رسمي للمادة (يُلحق عند النسخ) — يشمل النوع والجنسية اليمنية
function buildCitation(h: SearchHit): string {
  const nat =
    h.category === "قانون" ? " اليمني" : h.category === "لائحة" ? " اليمنية" : "";
  const parts = [displayLawTitle(h.law_title, h.category) + nat];
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

// ملاحظة «عُدّلت بعد 2014» + زر يكشف نص التعديل (النص الأساسي يبقى نسخة ما قبل 2014)
function Post2014Notice({
  amendedText,
  amendYear,
  lawId,
  onRef,
}: {
  amendedText: string;
  amendYear: number | null;
  lawId?: number;
  onRef?: (lawId: number, num: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="mt-3 text-xs bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg p-2.5">
      <p className="text-red-700 dark:text-red-300 leading-6">
        ⚠ عُدّلت هذه المادة بعد 2014{amendYear ? ` (سنة ${amendYear})` : ""}،
        والتعديل غير معترف به. النصّ أعلاه هو الصيغة المعتمدة قبل 2014.
      </p>
      <button
        onClick={() => setShow((s) => !s)}
        className="mt-2 px-2.5 py-1 rounded-lg border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors font-medium"
      >
        {show ? "▲ إخفاء نص التعديل" : "▼ إظهار نص التعديل بعد 2014"}
      </button>
      {show && (
        <div className="legal-text mt-2 pr-3 border-r-2 border-red-400 text-red-900 dark:text-red-200">
          <ArticleText content={amendedText} lawId={lawId} onRef={onRef} />
        </div>
      )}
    </div>
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
  law_id: number;
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
        <div className="legal-text">
          <ArticleText content={art.content} lawId={art.law_id} onRef={onRef} />
        </div>
      </article>
    </section>
  );
}

// لوحة إعداد الذكاء الاصطناعي بمفتاح المستخدم (BYOK) + دليل عربي
function AiSettings({
  apiKey,
  geminiKey,
  nexusUrl,
  userName,
  onSave,
  onClose,
}: {
  apiKey: string;
  geminiKey: string;
  nexusUrl: string;
  userName: string;
  onSave: (settings: { apiKey: string; geminiKey: string; nexusUrl: string; userName: string }) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(apiKey);
  const [geminiDraft, setGeminiDraft] = useState(geminiKey);
  const [nexusDraft, setNexusDraft] = useState(nexusUrl);
  const [nameDraft, setNameDraft] = useState(userName);
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
            البحث والتصفّح والحاسبات تعمل بلا أي مفتاح. للدردشة الذكية يمكن لكل
            مستخدم إنشاء مفتاح Gemini مجاني خاص به وحفظه على جهازه.
          </p>

          <div>
            <label className="block text-xs font-bold text-muted mb-1.5">
              اسمك (اختياري — ليخاطبك المستشار به)
            </label>
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              placeholder="مثال: الأستاذ محمد"
              className="w-full bg-transparent border border-border rounded-xl px-3 py-2.5 outline-none focus:border-primary transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-muted mb-1.5">
              مفتاح Gemini API المجاني
            </label>
            <input
              type={show ? "text" : "password"}
              value={geminiDraft}
              onChange={(e) => setGeminiDraft(e.target.value)}
              placeholder="ألصق مفتاح Google AI Studio"
              dir="ltr"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary text-left"
            />
            <p className="text-xs text-muted mt-1.5">
              يُحفظ على هذا الجهاز ويُرسل إلى Google عند السؤال. للاستخدام الشخصي التجريبي؛ لا تشارك المفتاح.
            </p>
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex mt-2 px-3 py-1.5 rounded-lg bg-accent text-white font-medium hover:opacity-90 transition-opacity"
            >
              إنشاء مفتاح Gemini مجاناً ↗
            </a>
            <ol className="mt-2 text-xs text-muted list-decimal list-inside space-y-1">
              <li>سجّل الدخول بحساب Google.</li>
              <li>اضغط Create API Key ثم انسخ المفتاح.</li>
              <li>عُد إلى التطبيق والصقه في الحقل واضغط حفظ وتفعيل.</li>
            </ol>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">
              تخضع الخدمة لحدود Google المجانية، وقد تستخدم Google محتوى الطلبات المجانية لتحسين خدماتها.
            </p>
          </div>

          {!GEMINI_ONLY_BUILD && <div>
            <label className="block text-xs font-bold text-muted mb-1.5">
              عنوان خادم Nexus
            </label>
            <input
              type="url"
              value={nexusDraft}
              onChange={(e) => setNexusDraft(e.target.value)}
              placeholder="https://nexus.example.com"
              dir="ltr"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary text-left"
            />
            <p className="text-xs text-muted mt-1.5">
              يلزم عنوان HTTPS لخادم يعمل عليه Nexus وOllama. لا تكتب /chat في النهاية.
            </p>
          </div>}

          {/* حقل المفتاح */}
          {!GEMINI_ONLY_BUILD && <div>
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
          </div>}

          <div className="flex gap-2">
            <button
              onClick={() => {
                onSave({ apiKey: draft, geminiKey: geminiDraft, nexusUrl: nexusDraft, userName: nameDraft });
                onClose();
              }}
              disabled={!draft.trim() && !geminiDraft.trim() && !nexusDraft.trim()}
              className="px-4 py-2 rounded-lg bg-primary text-white font-medium hover:bg-primary-strong disabled:opacity-50 transition-colors"
            >
              حفظ وتفعيل
            </button>
            {(apiKey || geminiKey || nexusUrl) && (
              <button
                onClick={() => {
                  onSave({ apiKey: "", geminiKey: "", nexusUrl: "", userName: nameDraft });
                  setDraft("");
                  setGeminiDraft("");
                  setNexusDraft("");
                  onClose();
                }}
                className="px-4 py-2 rounded-lg border border-red-300 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
              >
                تعطيل الذكاء الشبكي
              </button>
            )}
          </div>

          {/* الدليل خطوة بخطوة */}
          {!GEMINI_ONLY_BUILD && <details className="rounded-xl border border-border bg-background/40 p-3">
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
          </details>}
        </div>
      </div>
    </div>
  );
}

type Mode = "home" | "search" | "ask" | "browse";
type SearchKind = "smart" | "literal";

interface LawMeta {
  id: number;
  title: string;
  law_number: string | null;
  year: string | null;
  category: string | null;
  article_count: number;
}

// النوافذ الأربع للتصفّح: كل نافذة تجمع تصنيفاً أو أكثر
const BROWSE_WINDOWS: { key: string; label: string; cats: string[] }[] = [
  { key: "قانون", label: "القوانين", cats: ["دستور", "قانون"] },
  { key: "لائحة", label: "اللوائح", cats: ["لائحة"] },
  { key: "اتفاقية", label: "الاتفاقيات والمواثيق", cats: ["اتفاقية"] },
  { key: "حكم", label: "الأحكام والقواعد القضائية", cats: ["حكم"] },
  { key: "نيابة", label: "تعليمات النيابة", cats: ["نيابة"] },
];

// ترتيب ثابت لأهمّ القوانين في نافذة القوانين (الدستور أولاً ثم هذا التسلسل، فالبقية)
const LAW_ORDER = [
  "المدني",
  "المرافعات والتنفيذ المدني وتعديلاته",
  "الجرائم والعقوبات",
  "الإجراءات الجزائية",
  "الأحوال الشخصية",
  "التجاري",
  "السلطة القضائية",
  "التحكيم",
  "تنظيم مهنة المحاماة",
];

// أولوية الترتيب في نافذة القوانين: الدستور=0، ثم تسلسل LAW_ORDER، ثم البقية
function lawPriority(l: LawMeta): number {
  if ((l.category ?? "") === "دستور") return 0;
  const idx = LAW_ORDER.indexOf(l.title.trim());
  return idx === -1 ? Infinity : idx + 1;
}

// أي قانون جديد بعد 2014 يأخذ التحذير تلقائياً عند إدخاله في المكتبة.
// ندعم السنوات الميلادية والهجرية، ولا نطبّق القاعدة على اللوائح أو أنواع الوثائق الأخرى.
function isUnrecognizedPost2014Law(
  law: Pick<LawMeta, "year" | "category">,
): boolean {
  if (law.category !== "قانون" || !law.year) return false;
  const match = toLatinDigits(law.year).match(/\d{4}/);
  if (!match) return false;
  const year = Number(match[0]);
  return year >= 1900 ? year > 2014 : year > 1435;
}

function isSanaaPost2014Document(law: Pick<LawMeta, "title">): boolean {
  return law.title.startsWith("🔴 ");
}

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
  initialWindow = "قانون",
}: {
  onRef: (lawId: number, num: string) => void;
  onSpeak: (h: { article_id: number; content: string }) => void;
  onShare: (h: SearchHit) => void;
  onCopy: (h: SearchHit) => void;
  speakingId: number | null;
  copiedId: number | null;
  initialWindow?: string;
}) {
  const [laws, setLaws] = useState<LawMeta[] | null>(null);
  const [filter, setFilter] = useState("");
  const [cat, setCat] = useState<string>(initialWindow);
  const [sort, setSort] = useState<"year" | "number" | "name">("year");
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

  // عدّ الوثائق لكل نافذة (لعرضه على الألسنة)
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const w of BROWSE_WINDOWS) c[w.key] = 0;
    for (const l of laws ?? []) {
      const k = l.category ?? "قانون";
      for (const w of BROWSE_WINDOWS) if (w.cats.includes(k)) c[w.key]++;
    }
    return c;
  }, [laws]);

  const shown = useMemo(() => {
    const win = BROWSE_WINDOWS.find((w) => w.key === cat) ?? BROWSE_WINDOWS[0];
    const q = normalizeAr(filter);
    const num = (s: string | null) => {
      if (!s) return null;
      const m = toLatinDigits(s).match(/\d+/);
      return m ? Number(m[0]) : null;
    };
    const filtered = (laws ?? []).filter((l) => {
      const lcat = l.category ?? "قانون";
      if (!win.cats.includes(lcat)) return false;
      if (!q) return true;
      return normalizeAr(`${l.title} ${l.law_number ?? ""} ${l.year ?? ""}`).includes(q);
    });
    // الترتيب المختار (السنة/الرقم/الاسم)
    const byChosen = (a: LawMeta, b: LawMeta) => {
      if (sort === "name") return a.title.localeCompare(b.title, "ar");
      // السنة (الأحدث أولاً) أو الرقم (تصاعدياً)؛ القيم الفارغة في الآخر
      const va = sort === "year" ? num(a.year) : num(a.law_number);
      const vb = sort === "year" ? num(b.year) : num(b.law_number);
      if (va == null && vb == null) return a.title.localeCompare(b.title, "ar");
      if (va == null) return 1;
      if (vb == null) return -1;
      return sort === "year" ? vb - va : va - vb;
    };
    const arr = [...filtered];
    if (win.key === "قانون") {
      // نافذة القوانين: الترتيب الثابت أولاً (الدستور ثم التسلسل)، ثم الترتيب المختار
      arr.sort((a, b) => {
        const pa = lawPriority(a);
        const pb = lawPriority(b);
        if (pa !== pb) return pa - pb;
        return byChosen(a, b);
      });
    } else {
      arr.sort(byChosen);
    }
    return arr;
  }, [laws, filter, cat, sort]);

  const SORT_TABS: { key: "year" | "number" | "name"; label: string }[] = [
    { key: "year", label: "الأحدث" },
    { key: "number", label: "الرقم" },
    { key: "name", label: "الاسم" },
  ];

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
          <div className="legal-text">
            <ArticleText content={a.content} lawId={a.law_id} onRef={onRef} />
          </div>
          {a.amend_status === "unrecognized" &&
            (a.amended_text ? (
              <Post2014Notice
                amendedText={a.amended_text}
                amendYear={a.amend_year}
                lawId={a.law_id}
                onRef={onRef}
              />
            ) : (
              <p className="mt-3 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg p-2">
                ⚠ هذه المادة عليها تعديل أو إضافة بعد 2014 (سنة {a.amend_year}) غير
                معترف به، ولا تتوفّر لدينا نسخة ما قبل 2014 منها.
              </p>
            ))}
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
        <div
          className={"bg-surface border rounded-2xl p-5 shadow-sm mb-4 " +
            (isUnrecognizedPost2014Law(selected) || isSanaaPost2014Document(selected)
              ? "border-red-400 dark:border-red-800"
              : "border-border")}
        >
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-foreground">
              {displayLawTitle(selected.title, selected.category)}
            </h2>
            <DocTypeBadge category={selected.category} />
            {isUnrecognizedPost2014Law(selected) && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-600 text-white font-medium">
                ⚠ قانون جديد بعد 2014 — غير معترف به
              </span>
            )}
            {isSanaaPost2014Document(selected) && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-600 text-white font-medium">
                صادر من صنعاء بعد 2014
              </span>
            )}
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
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="inline-flex flex-wrap gap-1 rounded-xl border border-border bg-surface p-1">
          {BROWSE_WINDOWS.map((t) => (
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
        <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-surface p-1 ms-auto">
          <span className="text-xs text-muted px-1.5">ترتيب:</span>
          {SORT_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setSort(t.key)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                sort === t.key
                  ? "bg-accent/15 text-accent"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {laws && (
        <p className="text-xs text-muted mb-3">{shown.length} وثيقة</p>
      )}

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
            className={"text-right bg-surface border rounded-xl p-4 shadow-sm transition-colors " +
              (isUnrecognizedPost2014Law(l) || isSanaaPost2014Document(l)
                ? "border-red-400 hover:border-red-600 dark:border-red-800"
                : "border-border hover:border-primary")}
          >
            <div className="flex items-start gap-2">
              <span className="text-sm font-bold text-foreground flex-1">
                {displayLawTitle(l.title, l.category)}
              </span>
              <DocTypeBadge category={l.category} />
            </div>
            {isUnrecognizedPost2014Law(l) && (
              <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded-full bg-red-600 text-white font-medium">
                ⚠ قانون جديد بعد 2014 — غير معترف به
              </span>
            )}
            {isSanaaPost2014Document(l) && (
              <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded-full bg-red-600 text-white font-medium">
                صادر من صنعاء بعد 2014
              </span>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {(l.law_number || l.year) && (
                <span className="text-xs font-semibold text-accent bg-accent/10 rounded-md px-2 py-0.5">
                  {l.law_number ? `رقم (${l.law_number})` : ""}
                  {l.law_number && l.year ? " " : ""}
                  {l.year ? `لسنة ${l.year}م` : ""}
                </span>
              )}
              <span className="text-xs text-muted">{l.article_count} مادة</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

// ——— الشاشة الرئيسية: هيرو + بحث سريع + شبكة أقسام ———
function HomeScreen({
  apiKey,
  onOpenWindow,
  onSearch,
  onAsk,
}: {
  apiKey: string;
  onOpenWindow: (w: string) => void;
  onSearch: () => void;
  onAsk: () => void;
}) {
  const cards: {
    icon: string;
    title: string;
    sub: string;
    onClick: () => void;
  }[] = [
    { icon: "📗", title: "القوانين", sub: "الدستور والقوانين", onClick: () => onOpenWindow("قانون") },
    { icon: "📘", title: "اللوائح", sub: "اللوائح التنظيمية", onClick: () => onOpenWindow("لائحة") },
    { icon: "🤝", title: "الاتفاقيات", sub: "الاتفاقيات والمواثيق", onClick: () => onOpenWindow("اتفاقية") },
    { icon: "⚖️", title: "الأحكام والقواعد القضائية", sub: "أحكام ومبادئ", onClick: () => onOpenWindow("حكم") },
    { icon: "🏛️", title: "تعليمات النيابة", sub: "تعليمات وتعاميم", onClick: () => onOpenWindow("نيابة") },
  ];
  return (
    <div className="space-y-5">
      {/* هيرو */}
      <div className="yl-hero">
        <div className="yl-hero-title">القوانين اليمنية</div>
        <div className="yl-hero-sub">مكتبة قانونية ذكية — بحث وتصفّح وحاسبات</div>
        <div className="yl-hero-sign">تطوير: يحيى الجديعي</div>
      </div>

      {/* بحث سريع */}
      <button
        onClick={onSearch}
        className="w-full flex items-center gap-3 bg-surface border border-border rounded-2xl px-4 py-3 text-muted hover:border-primary transition-colors shadow-sm"
      >
        <span className="text-lg">🔎</span>
        <span className="text-sm">ابحث في نصوص القوانين والمواد…</span>
      </button>

      {/* شبكة الأقسام */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {cards.map((c) => (
          <button key={c.title} onClick={c.onClick} className="yl-homecard">
            <span className="yl-homecard-icon">{c.icon}</span>
            <span className="yl-homecard-title">{c.title}</span>
            <span className="yl-homecard-sub">{c.sub}</span>
          </button>
        ))}
      </div>

      {/* أدوات إضافية */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Link href="/tools" className="yl-homecard">
          <span className="yl-homecard-icon">🧮</span>
          <span className="yl-homecard-title">الحاسبات</span>
          <span className="yl-homecard-sub">رسوم · مواعيد · مواريث · ديات</span>
        </Link>
        <button onClick={onAsk} className="yl-homecard">
          <span className="yl-homecard-icon">🤖</span>
          <span className="yl-homecard-title">اسأل الذكاء</span>
          <span className="yl-homecard-sub">
            {apiKey ? "مُفعّل بمفتاحك" : "إجابات ذكية"}
          </span>
        </button>
        <Link href="/about" className="yl-homecard">
          <span className="yl-homecard-icon">ℹ️</span>
          <span className="yl-homecard-title">عن التطبيق</span>
          <span className="yl-homecard-sub">الهوية والمصادر</span>
        </Link>
      </div>
    </div>
  );
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("home");
  const [browseWindow, setBrowseWindow] = useState<string>("قانون");
  const [query, setQuery] = useState("");
  const [searchKind, setSearchKind] = useState<SearchKind>("smart");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [assist, setAssist] = useState<AssistantResult | null>(null);
  const [sources, setSources] = useState<AskSource[]>([]);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [listening, setListening] = useState(false);
  const [speakingId, setSpeakingId] = useState<number | null>(null);
  const [refArticle, setRefArticle] = useState<ArticleFull | null>(null);
  const [refLoading, setRefLoading] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [userName, setUserName] = useState("");
  const [nexusUrl, setNexusUrl] = useState("");
  const [nexusHistory, setNexusHistory] = useState<NexusMessage[]>([]);
  const [aiMeta, setAiMeta] = useState<string | null>(null);
  const [showAi, setShowAi] = useState(false);
  const [community, setCommunity] = useState<CommunityItem[]>([]);
  const [communityOptOut, setCommunityOptOut] = useState(false);

  // قراءة ?screen= عند الإقلاع (للانتقال من صفحات أخرى مثل /tools)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("screen");
    if (p === "search" || p === "browse" || p === "ask" || p === "home") {
      setMode(p);
    }
    const win = new URLSearchParams(window.location.search).get("win");
    if (win) setBrowseWindow(win);
  }, []);

  // تحميل مفتاح المستخدم المحفوظ محلياً (BYOK) عند الإقلاع
  useEffect(() => {
    try {
      const saved = localStorage.getItem("yl_claude_key");
      if (saved) setApiKey(saved);
      const savedNexus = localStorage.getItem("yl_nexus_url");
      if (savedNexus) setNexusUrl(savedNexus);
      const savedGemini = localStorage.getItem("yl_gemini_key");
      if (savedGemini) setGeminiKey(savedGemini);
      const savedName = localStorage.getItem("yl_user_name");
      if (savedName) setUserName(savedName);
      const savedChat = localStorage.getItem("yl_chat");
      if (savedChat) setNexusHistory(JSON.parse(savedChat) as NexusMessage[]);
      if (localStorage.getItem("yl_community_optout") === "1")
        setCommunityOptOut(true);
    } catch {
      /* تجاهل */
    }
  }, []);

  // جلب «يسأل الناس»: أكثر الأسئلة تكراراً من الخادم المشترك (اختياري، يفشل بصمت)
  useEffect(() => {
    if (mode !== "ask") return;
    let alive = true;
    fetch(`${FEEDBACK_URL}/api/community`)
      .then((r) => r.json())
      .then((d) => {
        if (alive && Array.isArray(d?.popular)) setCommunity(d.popular.slice(0, 8));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [mode]);

  // حفظ سجلّ المحادثة محلياً (تشات يبقى بين الجلسات)
  useEffect(() => {
    try {
      localStorage.setItem("yl_chat", JSON.stringify(nexusHistory.slice(-40)));
    } catch {
      /* تجاهل */
    }
  }, [nexusHistory]);

  function saveAiSettings(settings: { apiKey: string; geminiKey: string; nexusUrl: string; userName?: string }) {
    const key = settings.apiKey.trim();
    const googleKey = settings.geminiKey.trim();
    const url = settings.nexusUrl.trim().replace(/\/+$/, "");
    const name = (settings.userName ?? "").trim();
    setApiKey(key);
    setGeminiKey(googleKey);
    setNexusUrl(url);
    setUserName(name);
    setNexusHistory([]);
    setAiMeta(null);
    try {
      if (key) localStorage.setItem("yl_claude_key", key);
      else localStorage.removeItem("yl_claude_key");
      if (url) localStorage.setItem("yl_nexus_url", url);
      else localStorage.removeItem("yl_nexus_url");
      if (googleKey) localStorage.setItem("yl_gemini_key", googleKey);
      else localStorage.removeItem("yl_gemini_key");
      if (name) localStorage.setItem("yl_user_name", name);
      else localStorage.removeItem("yl_user_name");
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

  async function run(override?: string) {
    const q = (typeof override === "string" ? override : query).trim();
    if (!q) return;
    if (typeof override === "string") setQuery(override);
    setLoading(true);
    setError(null);
    setHits(null);
    setAnswer(null);
    setAssist(null);
    setSources([]);
    setAiMeta(null);

    try {
      if (mode === "search") {
        // الوضع المحلي (offline) إن توفّرت الحزمة، وإلا الخادم
        if (await offlineReady()) {
          const result =
            searchKind === "literal"
              ? await clientLiteralSearch(q, 300)
              : await clientSearch(q, 200);
          setHits(result as SearchHit[]);
        } else {
          const res = await fetch("/api/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: q, limit: 200 }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "تعذّر البحث");
          setHits(data.hits as SearchHit[]);
        }
      } else {
        // المستشار: يفهم النيّة ويجيب، والمحادثة تُعرض وتُحفظ كتشات
        const a = await assistantAnswer(q);
        let hits = a.hits;
        // توسيع السؤال بمصطلحات التشريع اليمني عبر Gemini ثم إعادة الاسترجاع،
        // لتجاوز اختلاف الألفاظ (تطليق للضرر ⇒ الفسخ للكراهية). ندمج مع الأصلية.
        if (geminiKey.trim() && a.kind === "search") {
          try {
            const expanded = await geminiExpandQuery(geminiKey, q);
            if (expanded) {
              const extra = await clientSearch(expanded, 10);
              const seen = new Set(hits.map((h) => h.article_id));
              hits = [
                ...hits,
                ...extra.filter((h) => !seen.has(h.article_id)),
              ].slice(0, 14);
            }
          } catch {
            /* تجاهل: نكمل بالمواد الأصلية */
          }
        }
        // لا نعرض قائمة المواد الطويلة أسفل الدردشة؛ المواد المرتبطة تظهر
        // كروابط قابلة للضغط تحت الإجابة (sources) لفتح كل مادة على حدة.
        setSources(
          hits.slice(0, 10).map((hit) => ({
            article_id: hit.article_id,
            law_id: hit.law_id,
            law_title: hit.law_title,
            law_number: hit.law_number,
            year: hit.year,
            article_number: hit.article_number,
          })),
        );
        const userMsg: NexusMessage = { role: "user", content: q };
        const calculatorContext =
          a.kind === "search"
            ? undefined
            : [a.title, ...a.lines, a.citation ? `المصدر: ${a.citation}` : ""]
                .filter(Boolean)
                .join("\n");
        // نصّ الإجابة الأوفلاينية (يُستعمل بلا مفتاح أو عند تعذّر النموذج)
        const offlineText =
          a.kind === "search"
            ? hits.length
              ? "أقرب المواد لسؤالك:\n" +
                hits.slice(0, 6).map((h) =>
                  `• ${displayLawTitle(h.law_title, h.category)}${h.article_number ? ` — مادة (${h.article_number})` : ""}`,
                ).join("\n")
              : "لم أجد مواد مطابقة. جرّب صياغة أخرى أو كلمات مفتاحية."
            : [a.title, ...a.lines, a.citation ? `المصدر: ${a.citation}` : ""]
                .filter(Boolean)
                .join("\n");
        let replyText = offlineText;
        let model = "";
        try {
          if (geminiKey.trim()) {
            const reply = await geminiChat(
              geminiKey, [...nexusHistory, userMsg], hits, calculatorContext, appKnowledge(), userName,
            );
            replyText = reply.content;
            model = reply.model;
          } else if (nexusUrl.trim()) {
            const reply = await nexusChat(nexusUrl, [...nexusHistory, userMsg]);
            replyText = reply.content;
            model = reply.model;
          } else if (apiKey.trim()) {
            const data = await clientAsk(q, apiKey.trim());
            replyText = data.answer;
            setSources((data.sources as AskSource[]) || []);
          }
        } catch (aiErr) {
          replyText =
            offlineText +
            `\n\n(تعذّر الاتصال بنموذج الذكاء: ${aiErr instanceof Error ? aiErr.message : "خطأ"} — هذه النتيجة المحلية.)`;
        }
        setAiMeta(model || null);
        setNexusHistory([...nexusHistory, userMsg, { role: "assistant", content: replyText }]);
        if (!communityOptOut) logCommunityQuestion(q, replyText);
        setQuery("");
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
    <div className="flex flex-col min-h-full pb-16">
      <header className="yl-appbar sticky top-0 z-30 shadow-md">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <button
            onClick={() => setMode("home")}
            className="flex items-center gap-2 text-right"
            aria-label="الرئيسية"
          >
            <span className="text-2xl">⚖️</span>
            <span className="leading-tight">
              <span className="yl-appbar-title block font-bold">القوانين اليمنية</span>
              <span className="yl-appbar-sign block text-[11px]">
                تطوير: يحيى الجديعي
              </span>
            </span>
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAi(true)}
              className="yl-appbar-btn text-sm whitespace-nowrap"
              title="إعداد الذكاء الاصطناعي بمفتاحك الخاص"
            >
              {apiKey || geminiKey || nexusUrl ? "🤖 مُفعّل" : "🤖"}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-5 pb-24 flex flex-col">
        {mode === "home" ? (
          <HomeScreen
            apiKey={apiKey}
            onOpenWindow={(w) => {
              setBrowseWindow(w);
              setMode("browse");
            }}
            onSearch={() => setMode("search")}
            onAsk={() => setMode("ask")}
          />
        ) : mode === "browse" ? (
          <LawLibrary
            initialWindow={browseWindow}
            onRef={openRef}
            onSpeak={speakArticle}
            onShare={shareArticle}
            onCopy={copyArticle}
            speakingId={speakingId}
            copiedId={copiedId}
          />
        ) : (
          <>
        {/* عنوان الوضع + رجوع للرئيسية */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-primary">
            {mode === "ask" ? "💡 المستشار القانوني" : "🔎 البحث في القوانين"}
          </h2>
          <button
            onClick={() => setMode(mode === "ask" ? "search" : "ask")}
            className="text-xs px-3 py-1.5 rounded-lg border border-border hover:border-primary hover:text-primary transition-colors"
          >
            {mode === "ask" ? "التبديل إلى البحث" : "اسأل المستشار بدلاً من ذلك"}
          </button>
        </div>
        {/* صندوق الإدخال: في الدردشة يلتصق بالأسفل تحت المحادثة (order-last) */}
        <div
          className={`bg-surface border border-border rounded-2xl p-3 shadow-sm ${
            mode === "ask"
              ? "order-last sticky bottom-16 z-20 shadow-lg mt-3"
              : ""
          }`}
        >
          {mode === "search" && (
            <div
              className="inline-flex gap-1 rounded-xl border border-border bg-background p-1 mb-2"
              role="group"
              aria-label="نوع البحث"
            >
              <button
                type="button"
                onClick={() => setSearchKind("smart")}
                aria-pressed={searchKind === "smart"}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  searchKind === "smart"
                    ? "bg-primary text-white"
                    : "text-muted hover:text-primary"
                }`}
              >
                بحث ذكي
              </button>
              <button
                type="button"
                onClick={() => setSearchKind("literal")}
                aria-pressed={searchKind === "literal"}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  searchKind === "literal"
                    ? "bg-primary text-white"
                    : "text-muted hover:text-primary"
                }`}
              >
                بحث حرفي
              </button>
            </div>
          )}
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            rows={mode === "ask" ? 3 : 2}
            placeholder={
              mode === "search"
                ? searchKind === "literal"
                  ? "ابحث عن لفظ أو عبارة مطابقة في نصوص المواد…"
                  : "ابحث بكلمة أو عبارة في نصوص المواد… (مثال: عقوبة السرقة)"
                : "اسأل ويُجيبك فوراً بلا إنترنت… مثل: كم قيمة الهاشمة؟ · رسم دعوى بـ50 مليون · متى ميعاد الاستئناف؟"
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
              onClick={() => run()}
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

        {/* واجهة التشات: سجلّ المحادثة (يُحفظ محلياً) */}
        {mode === "ask" && nexusHistory.length > 0 && (
          <section className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted">
                {aiMeta ? `🤖 ${aiMeta}` : "💡 المستشار القانوني"}
              </span>
              <button
                onClick={() => {
                  setNexusHistory([]);
                  setHits(null);
                  setSources([]);
                  setAiMeta(null);
                }}
                className="text-xs text-muted hover:text-red-600"
              >
                🗑 مسح المحادثة
              </button>
            </div>
            <div className="flex flex-col gap-3">
              {nexusHistory.map((m, i) => (
                <div
                  key={i}
                  className={`max-w-[88%] rounded-2xl px-4 py-2.5 shadow-sm ${
                    m.role === "user"
                      ? "self-start bg-primary text-white"
                      : "self-end bg-surface border border-border"
                  }`}
                >
                  <div className="legal-text text-[1.02rem] whitespace-pre-wrap">
                    {m.content}
                  </div>
                </div>
              ))}
            </div>
            {sources.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-muted mb-1.5">
                  📎 المواد المرتبطة (اضغط لفتح المادة):
                </p>
                <div className="flex flex-wrap gap-2">
                  {sources.map((s) => (
                    <button
                      key={s.article_id}
                      onClick={() => openRef(s.law_id, s.article_number ?? "")}
                      title="افتح نصّ المادة"
                      className="text-xs px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30 text-primary hover:bg-primary hover:text-white transition-colors"
                    >
                      {s.law_title}
                      {s.article_number ? ` — مادة (${s.article_number})` : ""}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <p className="text-[11px] text-muted mt-3">
              الإجابات استرشادية؛ المرجع النهائي النصّ الرسمي والمختصّ القانوني.
            </p>
          </section>
        )}

        {/* يسأل الناس: أكثر الأسئلة تكراراً — يظهر قبل بدء المحادثة */}
        {mode === "ask" && nexusHistory.length === 0 && community.length > 0 && (
          <section className="mt-5">
            <h2 className="text-sm font-bold text-primary mb-2">🔥 يسأل الناس</h2>
            <div className="flex flex-wrap gap-2">
              {community.map((c, i) => (
                <button
                  key={i}
                  onClick={() => run(c.q)}
                  disabled={loading}
                  className="text-sm px-3 py-1.5 rounded-full bg-surface border border-border text-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
                >
                  {c.q}
                  {c.count && c.count > 1 ? (
                    <span className="text-[10px] text-muted"> · {c.count}</span>
                  ) : null}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* إشعار الخصوصية + خيار عدم المشاركة */}
        {mode === "ask" && (
          <p className="text-[11px] text-muted mt-4 leading-relaxed">
            🔒 تُجمع أسئلتك بلا هوية لتحسين التطبيق وإفادة بقية المستخدمين.{" "}
            <button
              onClick={() => {
                const next = !communityOptOut;
                setCommunityOptOut(next);
                try {
                  localStorage.setItem("yl_community_optout", next ? "1" : "0");
                } catch {
                  /* تجاهل */
                }
              }}
              className="underline hover:text-primary"
            >
              {communityOptOut ? "تفعيل المشاركة" : "إيقاف المشاركة"}
            </button>
            {communityOptOut ? " (المشاركة موقوفة حالياً)" : ""}
          </p>
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
                        {displayLawTitle(h.law_title, h.category)}
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
                    <div className="legal-text">
                      <ArticleText
                        content={h.content}
                        lawId={h.law_id}
                        onRef={openRef}
                      />
                    </div>
                    {h.amend_status === "unrecognized" && h.amended_text ? (
                      <Post2014Notice
                        amendedText={h.amended_text}
                        amendYear={h.amend_year}
                        lawId={h.law_id}
                        onRef={openRef}
                      />
                    ) : (
                      <>
                        {h.amend_status === "unrecognized" && (
                          <p className="mt-3 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg p-2">
                            ⚠ هذه المادة عليها تعديل أو إضافة بعد 2014 (سنة {h.amend_year})
                            غير معترف به، ولا تتوفّر لدينا نسخة ما قبل 2014 منها.
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
                      </>
                    )}
                    <SimilarArticles articleId={h.article_id} onRef={openRef} />
                  </article>
                ))}
              </>
            )}
          </section>
        )}

        {!hits && !answer && !error && !loading && nexusHistory.length === 0 && (
          <>
            <ArticleOfDay
              onRead={speakArticle}
              speakingId={speakingId}
              onRef={openRef}
            />
            <div className="text-center text-muted py-10 text-sm">
              ابدأ بكتابة كلمة أو عبارة. البحث والحاسبات يعملان مجاناً
              ومحلياً على جهازك. لتفعيل «اسأل الذكاء الاصطناعي» أضِف مفتاحك الخاص من زرّ{" "}
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

      <SiteFooter />

      <AppBottomNav
        active={mode === "ask" ? "search" : mode}
        onNav={(s) => setMode(s)}
        onAi={() => setShowAi(true)}
      />

      {/* نافذة إعداد الذكاء الاصطناعي */}
      {showAi && (
        <AiSettings
          apiKey={apiKey}
          geminiKey={geminiKey}
          nexusUrl={nexusUrl}
          userName={userName}
          onSave={saveAiSettings}
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
                      ? `${displayLawTitle(refArticle.law_title, refArticle.category)}${refArticle.article_number ? ` — المادة (${refArticle.article_number})` : ""}`
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
                <div className="legal-text">
                  <ArticleText
                    content={refArticle.content}
                    lawId={refArticle.law_id}
                    onRef={openRef}
                  />
                </div>
                {refArticle.amend_status === "unrecognized" &&
                  refArticle.amended_text && (
                    <Post2014Notice
                      amendedText={refArticle.amended_text}
                      amendYear={refArticle.amend_year}
                      lawId={refArticle.law_id}
                      onRef={openRef}
                    />
                  )}
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
