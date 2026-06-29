// بحث دلالي في المتصفّح (offline-first) فوق حزمة البيانات الثابتة في public/data
// يحمّل المتجهات والنصوص مرّة، ويولّد متجه السؤال محلياً عبر transformers.js.
// لا خادم: يعمل دون إنترنت بعد تحميل الحزمة والنموذج أول مرّة.

import type { FeatureExtractionPipeline } from "@huggingface/transformers";
import { BASE_PATH } from "./base-path";

export interface ClientHit {
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

interface BundleLaw {
  id: number;
  title: string;
  law_number: string | null;
  year: string | null;
  category: string | null;
}
interface BundleArticle {
  id: number;
  law_id: number;
  article_number: string | null;
  heading: string | null;
  content: string;
  amend_year: number | null;
  amend_status: string | null;
  amend_note: string | null;
}
interface BundleMeta {
  count: number;
  dim: number;
  lawCount: number;
  model: string;
  shards?: { name: string; bytes: number }[];
  generatedAt: string;
}

interface Bundle {
  meta: BundleMeta;
  laws: Map<number, BundleLaw>;
  articles: BundleArticle[];
  vectors: Float32Array; // مُعبَّأة count×dim
  normContent: string[]; // نصوص مُطبَّعة للبحث اللفظي
}

let _bundle: Promise<Bundle> | null = null;
let _extractor: Promise<FeatureExtractionPipeline> | null = null;

// تطبيع عربي بسيط للبحث اللفظي: إزالة التشكيل وتوحيد الألف والتاء المربوطة
export function normalizeAr(s: string): string {
  return s
    .replace(/[ً-ْٰ]/g, "") // تشكيل
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ـ/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// تحميل حزمة البيانات مرّة واحدة (مع تخزينها في الذاكرة)
export function loadBundle(): Promise<Bundle> {
  if (!_bundle) {
    _bundle = (async () => {
      const [metaRes, lawsRes, artsRes] = await Promise.all([
        fetch(`${BASE_PATH}/data/meta.json`),
        fetch(`${BASE_PATH}/data/laws.json`),
        fetch(`${BASE_PATH}/data/articles.json`),
      ]);
      if (!metaRes.ok) {
        throw new Error("حزمة البيانات غير متوفّرة بعد");
      }
      const meta = (await metaRes.json()) as BundleMeta;
      const lawsArr = (await lawsRes.json()) as BundleLaw[];
      const articles = (await artsRes.json()) as BundleArticle[];

      // المتجهات مُقسَّمة إلى أجزاء (حدّ 25MB للملف على Cloudflare Pages)؛
      // نجلبها ونعيد تجميعها بايتياً بالترتيب. (توافق رجعي مع الملفّ الموحَّد القديم.)
      const shardNames = meta.shards?.length
        ? meta.shards.map((s) => s.name)
        : ["embeddings.bin"];
      const bufs = await Promise.all(
        shardNames.map(async (name) => {
          const r = await fetch(`${BASE_PATH}/data/${name}`);
          if (!r.ok) throw new Error("حزمة البيانات غير متوفّرة بعد");
          return r.arrayBuffer();
        }),
      );
      const total = bufs.reduce((n, b) => n + b.byteLength, 0);
      const merged = new Uint8Array(total);
      let off = 0;
      for (const b of bufs) {
        merged.set(new Uint8Array(b), off);
        off += b.byteLength;
      }
      const vectors = new Float32Array(merged.buffer);

      const laws = new Map<number, BundleLaw>();
      for (const l of lawsArr) laws.set(l.id, l);

      const normContent = articles.map((a) =>
        normalizeAr(`${a.heading ?? ""} ${a.content}`),
      );

      return { meta, laws, articles, vectors, normContent };
    })();
  }
  return _bundle;
}

// تحميل نموذج التضمين في المتصفّح (تنزيل لمرّة واحدة، يُخزَّن في الكاش)
async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!_extractor) {
    _extractor = (async () => {
      const { pipeline, env } = await import("@huggingface/transformers");
      // في المتصفّح: نُنزّل النموذج من مستودع HuggingFace ونعتمد الكاش
      env.allowLocalModels = false;
      return pipeline("feature-extraction", "Xenova/multilingual-e5-small");
    })();
  }
  return _extractor;
}

async function embedQuery(text: string, dim: number): Promise<Float32Array> {
  const extractor = await getExtractor();
  const clean = `query: ${text.replace(/\s+/g, " ").trim()}`;
  const out = await extractor(clean, { pooling: "mean", normalize: true });
  const v = Float32Array.from(out.data as Float32Array);
  if (v.length !== dim) {
    throw new Error("بُعد متجه السؤال غير متطابق مع الحزمة");
  }
  return v;
}

// هل الحزمة جاهزة (للتبديل بين الوضع المحلي والخادم)؟
let _offline: boolean | null = null;
export async function bundleAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_PATH}/data/meta.json`, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

// فحص مُخزَّن: هل نعمل في الوضع المحلي (دون خادم)؟ يُفحص مرّة ويُحفظ.
export async function offlineReady(): Promise<boolean> {
  if (_offline === null) _offline = await bundleAvailable();
  return _offline;
}

const KEYWORD_BOOST = 0.12;

// بحث هجين: تشابه دلالي + دفعة لفظية، يحاكي منطق الخادم
export async function clientSearch(
  query: string,
  limit = 20,
): Promise<ClientHit[]> {
  const q = query.trim();
  if (!q) return [];
  const bundle = await loadBundle();
  const { meta, articles, vectors, normContent, laws } = bundle;
  const dim = meta.dim;

  const qVec = await embedQuery(q, dim);
  const qNorm = normalizeAr(q);
  const qTokens = qNorm.split(" ").filter((t) => t.length >= 3);

  const scored: { i: number; score: number; kw: boolean }[] = new Array(
    articles.length,
  );
  for (let i = 0; i < articles.length; i++) {
    // تشابه جيب التمام (المتجهات مُطبَّعة ⇒ ضرب نقطي)
    let dot = 0;
    const off = i * dim;
    for (let d = 0; d < dim; d++) dot += qVec[d] * vectors[off + d];

    // دفعة لفظية إن ظهرت كلمات السؤال في نص المادة
    let kw = false;
    if (qTokens.length) {
      const hay = normContent[i];
      kw = qTokens.some((t) => hay.includes(t));
    }
    scored[i] = { i, score: dot + (kw ? KEYWORD_BOOST : 0), kw };
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, limit);

  return top.map(({ i, score, kw }) => {
    const a = articles[i];
    const law = laws.get(a.law_id);
    return {
      article_id: a.id,
      law_id: a.law_id,
      law_title: law?.title ?? "",
      law_number: law?.law_number ?? null,
      year: law?.year ?? null,
      category: law?.category ?? null,
      article_number: a.article_number,
      heading: a.heading,
      content: a.content,
      score,
      matched_keyword: kw,
      amend_year: a.amend_year,
      amend_status: a.amend_status,
      amend_note: a.amend_note,
    };
  });
}

// مواد مشابهة لمادة معيّنة (دون خادم) — اعتماداً على متجهها المخزَّن في الحزمة
export async function clientSimilar(
  articleId: number,
  limit = 5,
): Promise<ClientHit[]> {
  const bundle = await loadBundle();
  const { meta, articles, vectors, laws } = bundle;
  const dim = meta.dim;
  const baseIdx = articles.findIndex((a) => a.id === articleId);
  if (baseIdx < 0) return [];
  const baseOff = baseIdx * dim;

  const scored: { i: number; sim: number }[] = [];
  for (let i = 0; i < articles.length; i++) {
    if (i === baseIdx) continue;
    let dot = 0;
    const off = i * dim;
    for (let d = 0; d < dim; d++) dot += vectors[baseOff + d] * vectors[off + d];
    scored.push({ i, sim: dot });
  }
  scored.sort((a, b) => b.sim - a.sim);

  return scored.slice(0, limit).map(({ i, sim }) => {
    const a = articles[i];
    const law = laws.get(a.law_id);
    return {
      article_id: a.id,
      law_id: a.law_id,
      law_title: law?.title ?? "",
      law_number: law?.law_number ?? null,
      year: law?.year ?? null,
      category: law?.category ?? null,
      article_number: a.article_number,
      heading: a.heading,
      content: a.content,
      score: sim,
      matched_keyword: false,
      amend_year: a.amend_year,
      amend_status: a.amend_status,
      amend_note: a.amend_note,
    };
  });
}

// جلب مادة برقمها داخل قانون (للإحالات) — دون خادم
export async function clientArticle(
  lawId: number,
  articleNumber: string,
): Promise<ClientHit | null> {
  const bundle = await loadBundle();
  const { articles, laws } = bundle;
  const a = articles.find(
    (x) => x.law_id === lawId && x.article_number === String(articleNumber),
  );
  if (!a) return null;
  const law = laws.get(a.law_id);
  return {
    article_id: a.id,
    law_id: a.law_id,
    law_title: law?.title ?? "",
    law_number: law?.law_number ?? null,
    year: law?.year ?? null,
    category: law?.category ?? null,
    article_number: a.article_number,
    heading: a.heading,
    content: a.content,
    score: 1,
    matched_keyword: false,
    amend_year: a.amend_year,
    amend_status: a.amend_status,
    amend_note: a.amend_note,
  };
}

// مادة اليوم (نفس منطق البذرة في الخادم) — دون خادم
export async function clientArticleOfDay(): Promise<ClientHit | null> {
  const bundle = await loadBundle();
  const { articles, laws } = bundle;
  const pool = articles.filter(
    (a) =>
      a.article_number != null &&
      a.content.length >= 120 &&
      a.content.length <= 900,
  );
  if (pool.length === 0) return null;
  const today = new Date();
  const seed =
    today.getUTCFullYear() * 1000 +
    (today.getUTCMonth() + 1) * 50 +
    today.getUTCDate();
  const idx = Math.abs((seed * 2654435761) % pool.length);
  const a = pool[idx];
  const law = laws.get(a.law_id);
  return {
    article_id: a.id,
    law_id: a.law_id,
    law_title: law?.title ?? "",
    law_number: law?.law_number ?? null,
    year: law?.year ?? null,
    category: law?.category ?? null,
    article_number: a.article_number,
    heading: a.heading,
    content: a.content,
    score: 1,
    matched_keyword: false,
    amend_year: a.amend_year,
    amend_status: a.amend_status,
    amend_note: a.amend_note,
  };
}

// وصف مختصر لوثيقة في قائمة التصفّح
export interface ClientLaw {
  id: number;
  title: string;
  law_number: string | null;
  year: string | null;
  category: string | null;
  article_count: number;
}

// قائمة كل الوثائق (للتصفّح في المكتبة) — دون خادم
export async function clientLawList(): Promise<ClientLaw[]> {
  const bundle = await loadBundle();
  const counts = new Map<number, number>();
  for (const a of bundle.articles) {
    counts.set(a.law_id, (counts.get(a.law_id) ?? 0) + 1);
  }
  return Array.from(bundle.laws.values()).map((l) => ({
    id: l.id,
    title: l.title,
    law_number: l.law_number,
    year: l.year,
    category: l.category,
    article_count: counts.get(l.id) ?? 0,
  }));
}

// كل مواد وثيقة بالترتيب (لعرضها ككتاب) — دون خادم.
// مصفوفة الحزمة مُرتّبة أصلاً حسب (law_id, ordering, id) فالترشيح يحفظ الترتيب.
export async function clientLawArticles(lawId: number): Promise<ClientHit[]> {
  const bundle = await loadBundle();
  const { articles, laws } = bundle;
  const law = laws.get(lawId);
  return articles
    .filter((x) => x.law_id === lawId)
    .map((a) => ({
      article_id: a.id,
      law_id: a.law_id,
      law_title: law?.title ?? "",
      law_number: law?.law_number ?? null,
      year: law?.year ?? null,
      category: law?.category ?? null,
      article_number: a.article_number,
      heading: a.heading,
      content: a.content,
      score: 1,
      matched_keyword: false,
      amend_year: a.amend_year,
      amend_status: a.amend_status,
      amend_note: a.amend_note,
    }));
}

// كل نسخ مادة برقمها (للمقارنة قبل/بعد) — دون خادم
export async function clientVersions(
  lawId: number,
  articleNumber: string,
): Promise<ClientHit[]> {
  const bundle = await loadBundle();
  const { articles, laws } = bundle;
  const law = laws.get(lawId);
  return articles
    .filter(
      (x) => x.law_id === lawId && x.article_number === String(articleNumber),
    )
    .map((a) => ({
      article_id: a.id,
      law_id: a.law_id,
      law_title: law?.title ?? "",
      law_number: law?.law_number ?? null,
      year: law?.year ?? null,
      category: law?.category ?? null,
      article_number: a.article_number,
      heading: a.heading,
      content: a.content,
      score: 1,
      matched_keyword: false,
      amend_year: a.amend_year,
      amend_status: a.amend_status,
      amend_note: a.amend_note,
    }));
}
