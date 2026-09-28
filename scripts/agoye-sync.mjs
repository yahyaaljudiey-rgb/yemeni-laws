#!/usr/bin/env node

/**
 * تدقيق وجلب مجموعة التشريعات اليمنية من موقع النيابة العامة.
 *
 * الاستخدام:
 *   node scripts/agoye-sync.mjs
 *   node scripts/agoye-sync.mjs --refresh
 *
 * المخرجات (لا تعدّل قاعدة التطبيق):
 *   data/incoming/agoye/catalog.json
 *   data/incoming/agoye/audit.json
 *   data/incoming/agoye/AUDIT.md
 *   data/incoming/agoye/documents/<id>.json
 *
 * يحترم الخادم: طلبان متوازيان كحد أقصى، مع كاش محلي وإعادة محاولات.
 */

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const BASE_URL = "https://www.agoye.gov.ye";
const SOURCE_NAME = "النيابة العامة اليمنية";
const CATEGORY_IDS = [44, 58, 59, 60, 61, 62, 63, 48, 67, 76, 65, 75, 68, 69];
const OUT_DIR = path.join(ROOT, "data", "incoming", "agoye");
const CACHE_DIR = path.join(OUT_DIR, "cache");
const DOCS_DIR = path.join(OUT_DIR, "documents");
const REFRESH = process.argv.includes("--refresh");
const USER_AGENT =
  "Mozilla/5.0 (compatible; YemeniLawsResearch/1.0; +https://yahyaaljudiey-rgb.github.io/yemeni-laws/)";

// تطابقات حُسمت ببصمة المحتوى أو بالرقم والسنة رغم اختلاف صياغة العنوان.
const KNOWN_LOCAL_MATCHES = new Map([
  [376, 240],
  [394, 132],
  [401, 260],
  [405, 263],
  [412, 264],
  [440, 328],
  [442, 329],
  [443, 330],
  [452, 347],
  [460, 355],
  [477, 360],
]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function decodeEntities(value) {
  return String(value ?? "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function htmlToText(html) {
  return decodeEntities(
    String(html ?? "")
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|li|h[1-6]|tr)>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "- ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\r/g, "")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeArabic(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const STOP_WORDS = new Set(
  "قانون قرار جمهوري بالقانون رقم لسنه بشان اصدار تعديلاته المعدل عام لعام رئيس مجلس الوزراء اليمن الجمهوريه اليمنيه".split(
    " ",
  ),
);

function stemWord(word) {
  return word.replace(/^[وفبكل]?ال/, "").replace(/^لل/, "");
}

function titleTokens(value) {
  return normalizeArabic(value)
    .split(/\s+/)
    .map(stemWord)
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word) && !/^\d+$/.test(word));
}

function titleScore(left, right) {
  const a = new Set(titleTokens(left));
  const b = new Set(titleTokens(right));
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const word of a) if (b.has(word)) intersection += 1;
  return intersection / Math.min(a.size, b.size);
}

function extractNumberYear(value) {
  const text = normalizeArabic(value);
  const patterns = [
    /(?:رقم|بالقانون)\s*\(?\s*(\d+)\s*\)?\s*(?:لسنه|لعام)\s*(\d{4})/,
    /\b(\d+)\s*[-/]\s*(\d{4})\b/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return { number: match[1], year: match[2] };
  }
  return { number: null, year: null };
}

function inferCategory(title, categoryId) {
  const normalized = normalizeArabic(title);
  if ([65, 67, 75, 76].includes(categoryId)) return "اتفاقية";
  if (/اتفاق|معاهده|ميثاق|اعلان|بروتوكول|مبادئ|قواعد/.test(normalized)) return "اتفاقية";
  if (/لائحه/.test(normalized)) return "لائحة";
  if (/تعليمات|نيابه/.test(normalized)) return "نيابة";
  if (/قرار/.test(normalized)) return "قرار";
  return "قانون";
}

function safeTitle(title) {
  return htmlToText(title).replace(/^\s*\d+\s*[-–—.]\s*/, "").trim();
}

async function fetchCached(url, cacheName) {
  const cachePath = path.join(CACHE_DIR, cacheName);
  if (!REFRESH) {
    try {
      return await fs.readFile(cachePath, "utf8");
    } catch {
      // أول تشغيل أو ملف غير مكتمل.
    }
  }

  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      if (html.length < 500) throw new Error("صفحة قصيرة على نحو غير متوقع");
      await fs.writeFile(cachePath, html, "utf8");
      await sleep(250);
      return html;
    } catch (error) {
      lastError = error;
      await sleep(attempt * 1_000);
    }
  }
  throw new Error(`تعذر جلب ${url}: ${lastError?.message ?? lastError}`);
}

function extractCatalogPage(html, categoryId) {
  const items = [];
  const linkPattern =
    /<a\s+href=["']?page\.php\?lng=arabic&id=(\d+)["']?[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkPattern.exec(html))) {
    const title = safeTitle(match[2]);
    if (!title) continue;
    items.push({
      sourceId: Number(match[1]),
      categoryId,
      catalogTitle: title,
      sourceUrl: `${BASE_URL}/page.php?id=${match[1]}&lng=arabic`,
    });
  }
  return items;
}

function extractDocument(html, catalogItem) {
  const titleMatch = html.match(/<title>\s*النيابة العامة\s*-\s*اليمن\s*-([\s\S]*?)<\/title>/i);
  const pageTitle = safeTitle(titleMatch?.[1] || catalogItem.catalogTitle);
  const bodyMatch = html.match(
    /<div\s+class=["']inside_rights["'][^>]*>([\s\S]*?)(?=<div\s+class=["']col-lg-12\s+col-md-12\s+col-xs-12["'])/i,
  );
  const text = htmlToText(bodyMatch?.[1] ?? "");
  const metadata = extractNumberYear(`${pageTitle}\n${text.slice(0, 2_500)}`);
  const blocks = splitIntoBlocks(text);
  return {
    ...catalogItem,
    title: pageTitle || catalogItem.catalogTitle,
    lawNumber: metadata.number,
    year: metadata.year,
    category: inferCategory(pageTitle || catalogItem.catalogTitle, catalogItem.categoryId),
    sourceName: SOURCE_NAME,
    fetchedAt: new Date().toISOString(),
    text,
    blocks,
    articleCount: blocks.filter((block) => block.type === "article").length,
  };
}

function splitIntoBlocks(text) {
  if (!text) return [];
  const articlePattern = /(?:^|\n)\s*ماد(?:ة|ه)\s*\(?\s*([0-9٠-٩]+)\s*\)?\s*[:：-]?/g;
  const matches = [...text.matchAll(articlePattern)];
  if (!matches.length) return [{ type: "preamble", text }];

  const blocks = [];
  const preamble = text.slice(0, matches[0].index).trim();
  if (preamble) blocks.push({ type: "preamble", text: preamble });

  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const start = current.index + current[0].length;
    const end = matches[index + 1]?.index ?? text.length;
    const number = current[1].replace(/[٠-٩]/g, (digit) => "٠١٢٣٤٥٦٧٨٩".indexOf(digit));
    const content = text.slice(start, end).trim();
    if (content) {
      blocks.push({ type: "article", article_number: number, num: number, text: content });
    }
  }
  return blocks;
}

function matchAgainstLocal(document, localLaws) {
  if (document.fetchError) {
    return { status: "fetch-error", score: 0, localMatch: null };
  }
  const imported = localLaws.find((law) => law.source_file === `agoye:${document.sourceId}`);
  if (imported) {
    return {
      status: "present",
      score: 1,
      localMatch: {
        id: imported.id,
        title: imported.title,
        lawNumber: imported.law_number,
        year: imported.year,
        category: imported.category,
      },
    };
  }
  const knownLocalId = KNOWN_LOCAL_MATCHES.get(document.sourceId);
  const knownLocal = knownLocalId ? localLaws.find((law) => law.id === knownLocalId) : null;
  if (knownLocal) {
    return {
      status: "present",
      score: 1,
      localMatch: {
        id: knownLocal.id,
        title: knownLocal.title,
        lawNumber: knownLocal.law_number,
        year: knownLocal.year,
        category: knownLocal.category,
      },
    };
  }
  let best = null;
  for (const law of localLaws) {
    let score = titleScore(document.title, law.title);
    const sameNumber = document.lawNumber && law.law_number === document.lawNumber;
    const sameYear = document.year && law.year === document.year;
    if (sameNumber && sameYear && score >= 0.25) score = Math.max(score, 0.99);
    if (sameYear && score >= 0.7) score = Math.max(score, 0.95);
    if (!best || score > best.score) best = { score, law };
  }

  const wrapper = /^الكتاب\s+(?:الرابع|السادس)/.test(document.title);
  let status = "missing";
  if (wrapper && document.articleCount === 0 && document.text.length < 500) status = "index-page";
  else if (best?.score >= 0.9) status = "present";
  else if (best?.score >= 0.65) status = "review";

  return {
    status,
    score: Number((best?.score ?? 0).toFixed(3)),
    localMatch: best
      ? {
          id: best.law.id,
          title: best.law.title,
          lawNumber: best.law.law_number,
          year: best.law.year,
          category: best.law.category,
        }
      : null,
  };
}

async function mapConcurrent(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: limit }, run));
  return results;
}

function renderMarkdown(audit) {
  const counts = Object.fromEntries(
    ["present", "review", "missing", "index-page", "fetch-error"].map((status) => [
      status,
      audit.items.filter((item) => item.status === status).length,
    ]),
  );
  const lines = [
    "# تدقيق تشريعات موقع النيابة العامة اليمنية",
    "",
    `- تاريخ التدقيق: ${audit.generatedAt}`,
    `- روابط الموقع الفريدة: ${audit.siteCount}`,
    `- سجلات التطبيق الحالية: ${audit.localCount}`,
    `- موجود بثقة عالية: ${counts.present}`,
    `- يحتاج مراجعة: ${counts.review}`,
    `- ناقص مبدئيًا: ${counts.missing}`,
    `- صفحات فهرسة وليست تشريعات: ${counts["index-page"]}`,
    `- تعذّر جلبها: ${counts["fetch-error"]}`,
    "",
    "## الناقص والمحتاج للمراجعة",
    "",
    "| الحالة | معرّف المصدر | التشريع | الرقم/السنة | أقرب سجل محلي | الرابط |",
    "|---|---:|---|---|---|---|",
  ];
  for (const item of audit.items.filter((entry) => ["missing", "review", "fetch-error"].includes(entry.status))) {
    const local = item.localMatch
      ? `${item.localMatch.title} (${Math.round(item.score * 100)}%)`
      : "—";
    lines.push(
      `| ${item.status} | ${item.sourceId} | ${item.title.replaceAll("|", "\\|")} | ${item.lawNumber ?? "—"}/${item.year ?? "—"} | ${local.replaceAll("|", "\\|")} | [المصدر](${item.sourceUrl}) |`,
    );
  }
  lines.push("", "> المطابقة الآلية مساعدة أولية، ولا تُعد حكمًا على سريان التشريع أو إلغائه.", "");
  return lines.join("\n");
}

async function main() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.mkdir(DOCS_DIR, { recursive: true });

  const categoryPages = await mapConcurrent(CATEGORY_IDS, 2, async (categoryId) => {
    const url = `${BASE_URL}/page.php?cid=${categoryId}`;
    const html = await fetchCached(url, `category-${categoryId}.html`);
    return extractCatalogPage(html, categoryId);
  });

  const byId = new Map();
  for (const item of categoryPages.flat()) if (!byId.has(item.sourceId)) byId.set(item.sourceId, item);
  const catalog = [...byId.values()].sort((a, b) => a.sourceId - b.sourceId);
  console.log(`• فهرس الموقع: ${catalog.length} رابطًا فريدًا`);

  let finished = 0;
  const documents = await mapConcurrent(catalog, 2, async (item) => {
    let document;
    try {
      const html = await fetchCached(item.sourceUrl, `document-${item.sourceId}.html`);
      document = extractDocument(html, item);
    } catch (error) {
      document = {
        ...item,
        title: item.catalogTitle,
        sourceName: SOURCE_NAME,
        fetchedAt: new Date().toISOString(),
        fetchError: error?.message ?? String(error),
        text: "",
        blocks: [],
        articleCount: 0,
        lawNumber: null,
        year: null,
        category: inferCategory(item.catalogTitle, item.categoryId),
      };
      console.warn(`⚠ تعذر جلب ${item.sourceId}: ${document.fetchError}`);
    }
    await fs.writeFile(
      path.join(DOCS_DIR, `${item.sourceId}.json`),
      JSON.stringify(document, null, 2),
      "utf8",
    );
    finished += 1;
    if (finished % 20 === 0 || finished === catalog.length) {
      console.log(`• جلب النصوص: ${finished}/${catalog.length}`);
    }
    return document;
  });

  const localLaws = JSON.parse(await fs.readFile(path.join(ROOT, "public", "data", "laws.json"), "utf8"));
  const items = documents
    .map((document) => ({ ...document, ...matchAgainstLocal(document, localLaws) }))
    .sort((a, b) => {
      const order = { missing: 0, review: 1, "fetch-error": 2, present: 3, "index-page": 4 };
      return order[a.status] - order[b.status] || a.sourceId - b.sourceId;
    });
  const audit = {
    generatedAt: new Date().toISOString(),
    source: SOURCE_NAME,
    sourceUrl: `${BASE_URL}/page.php?cid=11`,
    categoryIds: CATEGORY_IDS,
    siteCount: catalog.length,
    localCount: localLaws.length,
    items,
  };

  await fs.writeFile(path.join(OUT_DIR, "catalog.json"), JSON.stringify(catalog, null, 2), "utf8");
  await fs.writeFile(path.join(OUT_DIR, "audit.json"), JSON.stringify(audit, null, 2), "utf8");
  await fs.writeFile(path.join(OUT_DIR, "AUDIT.md"), renderMarkdown(audit), "utf8");

  const counts = Object.fromEntries(
    ["present", "review", "missing", "index-page", "fetch-error"].map((status) => [
      status,
      items.filter((item) => item.status === status).length,
    ]),
  );
  console.log("✅ اكتمل التدقيق", counts);
  console.log(`   ${path.relative(ROOT, path.join(OUT_DIR, "AUDIT.md"))}`);
}

main().catch((error) => {
  console.error("❌", error);
  process.exitCode = 1;
});
