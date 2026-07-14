// بحث في المتصفّح (offline-first) فوق حزمة البيانات الثابتة في public/data.
// البحث الأساسي لفظيّ ذكيّ (تطبيع عربي + ترجيح) يعمل فوراً على أي جهاز بلا
// تنزيل أي نموذج. المتجهات تُحمَّل فقط عند الحاجة (المواد المشابهة).
// لا خادم: يعمل دون إنترنت بعد تحميل الحزمة أول مرّة.

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
  amended_text: string | null;
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
  amended_text: string | null;
}
interface BundleMeta {
  count: number;
  dim: number;
  lawCount: number;
  model: string;
  shards?: { name: string; bytes: number }[];
  generatedAt: string;
}

// حزمة النصوص (خفيفة): تُحمَّل للبحث والتصفّح دون أي متجهات أو نماذج
interface TextBundle {
  meta: BundleMeta;
  laws: Map<number, BundleLaw>;
  lawNormTitle: Map<number, string>; // عنوان مُطبَّع لكل قانون (لترجيح العنوان)
  articles: BundleArticle[];
  normContent: string[]; // نصوص مُطبَّعة للبحث اللفظي
}

let _text: Promise<TextBundle> | null = null;
let _vectors: Promise<Float32Array> | null = null;

// تطبيع عربي للبحث اللفظي: إزالة التشكيل وتوحيد الألف والياء والتاء المربوطة والهمزات
export function normalizeAr(s: string): string {
  return s
    .replace(/[ً-ْٰ]/g, "") // تشكيل
    .replace(/[إأآٱا]/g, "ا") // يشمل ألف الوصل ٱ (مطابقة لتطبيع نواة Phase 15)
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ء/g, "")
    .replace(/ة/g, "ه")
    .replace(/ـ/g, "")
    // إزالة الترقيم وأي رمز غير حرفي (يعامَل كفاصل كلمات). حاسم: بدونه تلتصق
    // «؟» بآخر كلمة في السؤال فلا تطابق أي مادة (كل سؤال عربي ينتهي بـ«؟»).
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// كلمات وقف عربية شائعة لا تفيد في الترجيح
const STOP = new Set([
  "في","من","الى","على","عن","مع","هل","ما","ماذا","كيف","متى","اين","لماذا",
  "هي","هو","هذا","هذه","ذلك","التي","الذي","ان","انه","كان","قد","كل","او","ام",
  "ثم","بين","عند","لدى","غير","سوى","حتى","اذا","لكن","بعد","قبل","حول","ايضا",
]);

// تجريد «ال» التعريفية إن بقيت كلمة ذات معنى (السرقة→سرقة) لتحسين التطابق؛
// البحث بالمقطع الفرعي يطابق حينها الصيغتين (سرقة داخل السرقة).
function stripAl(t: string): string {
  return t.length > 4 && t.startsWith("ال") ? t.slice(2) : t;
}

// استخراج وحدات بحث مفيدة من نصّ مُطبَّع
function queryTerms(qNorm: string): string[] {
  const seen = new Set<string>();
  for (const t of qNorm.split(" ")) {
    if (t.length >= 2 && !STOP.has(t)) seen.add(stripAl(t));
  }
  return [...seen];
}

// تحميل النصوص مرّة واحدة (خفيف — لا متجهات)
export function loadText(): Promise<TextBundle> {
  if (!_text) {
    _text = (async () => {
      const [metaRes, lawsRes, artsRes] = await Promise.all([
        fetch(`${BASE_PATH}/data/meta.json`),
        fetch(`${BASE_PATH}/data/laws.json`),
        fetch(`${BASE_PATH}/data/articles.json`),
      ]);
      if (!metaRes.ok) throw new Error("حزمة البيانات غير متوفّرة بعد");
      const meta = (await metaRes.json()) as BundleMeta;
      const lawsArr = (await lawsRes.json()) as BundleLaw[];
      const articles = (await artsRes.json()) as BundleArticle[];

      const laws = new Map<number, BundleLaw>();
      const lawNormTitle = new Map<number, string>();
      for (const l of lawsArr) {
        laws.set(l.id, l);
        lawNormTitle.set(l.id, normalizeAr(l.title));
      }
      const normContent = articles.map((a) =>
        normalizeAr(`${a.heading ?? ""} ${a.content}`),
      );
      return { meta, laws, lawNormTitle, articles, normContent };
    })();
  }
  return _text;
}

// تحميل المتجهات عند الطلب فقط (للمواد المشابهة) — حدّ 25MB للملف ⇒ أجزاء
function loadVectors(): Promise<Float32Array> {
  if (!_vectors) {
    _vectors = (async () => {
      const meta = (await loadText()).meta;
      const shardNames = meta.shards?.length
        ? meta.shards.map((s) => s.name)
        : ["embeddings.bin"];
      const bufs = await Promise.all(
        shardNames.map(async (name) => {
          const r = await fetch(`${BASE_PATH}/data/${name}`);
          if (!r.ok) throw new Error("متجهات الحزمة غير متوفّرة");
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
      return new Float32Array(merged.buffer);
    })();
  }
  return _vectors;
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

// بحث لفظيّ ذكيّ: يعمل فوراً على أي جهاز (بلا نموذج/تنزيل). يرجّح بتغطية
// الكلمات، وتطابق العبارة كاملة، وظهورها في العنوان أو الترويسة.
export async function clientSearch(
  query: string,
  limit = 200,
): Promise<ClientHit[]> {
  const q = query.trim();
  if (!q) return [];
  const { articles, normContent, laws, lawNormTitle } = await loadText();

  const qNorm = normalizeAr(q);
  const terms = queryTerms(qNorm);
  // إن لم تبقَ كلمات مفيدة (سؤال كلّه كلمات وقف)، نستعمل النص المُطبَّع كلّه
  const effTerms = terms.length ? terms : qNorm ? [qNorm] : [];
  if (effTerms.length === 0) return [];
  const phrase = qNorm.length >= 4 && qNorm.includes(" ") ? qNorm : null;

  // وزن ندرة كل كلمة (IDF): الكلمة النادرة المميّزة («السرقة») تزن أضعاف
  // الشائعة («عقوبة»)، وإلا طغت الكلمات الشائعة وأخرجت مواد غير ذات صلة.
  const N = articles.length;
  const idf = new Map<string, number>();
  let idfTotal = 0;
  for (const t of effTerms) {
    let df = 0;
    for (let i = 0; i < N; i++) if (normContent[i].includes(t)) df++;
    const w = Math.log((N + 1) / (df + 1)) + 0.1;
    idf.set(t, w);
    idfTotal += w;
  }
  if (idfTotal === 0) idfTotal = 1;

  const scored: { i: number; score: number; kw: boolean }[] = [];
  for (let i = 0; i < N; i++) {
    const hay = normContent[i];
    let weight = 0;
    let hits = 0;
    for (const t of effTerms) if (hay.includes(t)) { weight += idf.get(t)!; hits++; }

    const title = lawNormTitle.get(articles[i].law_id) ?? "";
    let titleWeight = 0;
    for (const t of effTerms) if (title.includes(t)) titleWeight += idf.get(t)!;

    if (weight === 0 && titleWeight === 0) continue;

    let score = weight / idfTotal; // تغطية مرجّحة بالندرة 0..1
    if (hits === effTerms.length) score += 0.3; // كل الكلمات حاضرة
    if (phrase && hay.includes(phrase)) score += 0.6; // العبارة كاملة
    score += (titleWeight / idfTotal) * 0.4; // تطابق العنوان مهمّ
    // تفضيل المواد الأقصر قليلاً (أدقّ غالباً) عند تساوي الباقي
    score += Math.max(0, 1 - hay.length / 4000) * 0.03;

    scored.push({ i, score, kw: hits > 0 });
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
      amended_text: a.amended_text,
    };
  });
}

// مواد مشابهة لمادة معيّنة (دون خادم) — اعتماداً على متجهها المخزَّن في الحزمة
// بحث لفظيّ صارم: يُظهر فقط المواد التي تحتوي **نفس اللفظة/العبارة حرفياً**
// (تطبيع عربي فقط: تشكيل/همزات/ألف/ياء)، دون مشابهات ولا تطابق العنوان.
export async function clientLiteralSearch(
  query: string,
  limit = 300,
): Promise<ClientHit[]> {
  const q = query.trim();
  if (!q) return [];
  const { articles, normContent, laws } = await loadText();
  const qn = normalizeAr(q);
  const terms = qn.split(" ").filter((t) => t.length >= 2);
  if (terms.length === 0) return [];
  const phrase = qn.includes(" ") ? qn : null;

  const countOcc = (hay: string, needle: string) => {
    let c = 0,
      idx = 0;
    while ((idx = hay.indexOf(needle, idx)) !== -1) {
      c++;
      idx += needle.length;
    }
    return c;
  };

  const scored: { i: number; score: number }[] = [];
  for (let i = 0; i < articles.length; i++) {
    const hay = normContent[i];
    if (phrase && hay.includes(phrase)) {
      scored.push({ i, score: 100000 + countOcc(hay, phrase) });
    } else if (terms.every((t) => hay.includes(t))) {
      // كل الكلمات حاضرة حرفياً (وإن تباعدت)
      const total = terms.reduce((s, t) => s + countOcc(hay, t), 0);
      scored.push({ i, score: total });
    }
    // غير ذلك: ليس تطابقاً لفظياً → يُستبعد
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ i, score }) => {
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
      matched_keyword: true,
      amend_year: a.amend_year,
      amend_status: a.amend_status,
      amend_note: a.amend_note,
      amended_text: a.amended_text,
    };
  });
}

export async function clientSimilar(
  articleId: number,
  limit = 5,
): Promise<ClientHit[]> {
  const { meta, articles, laws } = await loadText();
  const vectors = await loadVectors();
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
      amended_text: a.amended_text,
    };
  });
}

// جلب مادة برقمها داخل قانون (للإحالات) — دون خادم
export async function clientArticle(
  lawId: number,
  articleNumber: string,
): Promise<ClientHit | null> {
  const bundle = await loadText();
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
    amended_text: a.amended_text,
  };
}

// مادة اليوم (نفس منطق البذرة في الخادم) — دون خادم
export async function clientArticleOfDay(): Promise<ClientHit | null> {
  const bundle = await loadText();
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
    amended_text: a.amended_text,
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
  const bundle = await loadText();
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
  const bundle = await loadText();
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
      amended_text: a.amended_text,
    }));
}

// كل نسخ مادة برقمها (للمقارنة قبل/بعد) — دون خادم
export async function clientVersions(
  lawId: number,
  articleNumber: string,
): Promise<ClientHit[]> {
  const bundle = await loadText();
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
      amended_text: a.amended_text,
    }));
}
