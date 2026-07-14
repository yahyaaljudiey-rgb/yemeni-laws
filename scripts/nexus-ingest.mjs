#!/usr/bin/env node
// إدخال كامل محتوى «تطبيق القوانين اليمنية» إلى نواة NEXUS (Phase 15+):
// القوانين، مواد القوانين بنصّها الكامل، الأحكام القضائية، الحاسبات بأساسها
// القانوني، وهيكل التطبيق/المطوّر. يبني وثائق { content, title, metadata }
// مطابقة لعقد «POST /documents» في NEXUS، فيتولّى NEXUS التقطيع والتضمين
// والفهرسة بالتطبيع العربي (Phase 13).
//
// الاستخدام:
//   node scripts/nexus-ingest.mjs --out out/nexus         # يُخرج الوثائق للتفتيش/التسليم (بلا خادم)
//   node scripts/nexus-ingest.mjs --url https://HOST       # يُدخل فعلياً إلى خادم NEXUS جاهز
//   خيارات: --token T  --concurrency N(=6)  --limit N  --only laws,articles,judgments,app  --dry
//
// الإدخال قابل للاستئناف: يحفظ تقدّمه في <out>/.progress.json (أو .nexus-ingest-progress.json)
// بمفتاح extId، فلا يُعيد إدخال ما نجح. الحقل metadata.ext_id يحمل المعرّف المستقر.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildAppDocs } from "./nexus-app-docs.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "public", "data");

// ————————————————————————————— وسائط —————————————————————————————
function parseArgs(argv) {
  const a = { concurrency: 6, only: null, out: null, url: null, token: null, limit: 0, dry: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--out") a.out = argv[++i];
    else if (k === "--url") a.url = argv[++i].replace(/\/+$/, "");
    else if (k === "--token") a.token = argv[++i];
    else if (k === "--concurrency") a.concurrency = Math.max(1, Number(argv[++i]) || 6);
    else if (k === "--limit") a.limit = Math.max(0, Number(argv[++i]) || 0);
    else if (k === "--only") a.only = new Set(argv[++i].split(",").map((s) => s.trim()));
    else if (k === "--dry") a.dry = true;
  }
  return a;
}

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const asArray = (j) => (Array.isArray(j) ? j : Object.values(j).find(Array.isArray) || []);
const want = (only, group) => !only || only.has(group);

// ————————————————————————————— بناة الوثائق —————————————————————————————
// كل بانٍ يُرجع { extId, title, content, metadata }.

function* buildLawArticles(laws, articles) {
  const lawById = new Map(laws.map((l) => [l.id, l]));
  for (const a of articles) {
    const content = (a.content || "").trim();
    if (!content) continue;
    const law = lawById.get(a.law_id) || {};
    const num = a.article_number != null && a.article_number !== "" ? String(a.article_number) : null;
    const heading = (a.heading || "").trim();
    const lawTitle = (law.title || "قانون").trim();
    const title = num ? `${lawTitle} — مادة (${num})` : `${lawTitle} — ${heading || "نص"}`;
    // النص المفهرس: العنوان الجانبي + النص. للتعديلات غير المعترف بها ننبّه.
    let body = heading && heading !== title ? `${heading}\n\n${content}` : content;
    if (a.amend_status === "unrecognized" && a.amend_note) {
      body += `\n\n(تنبيه: يتضمّن تعديلاً غير معترف به${a.amend_year ? ` (${a.amend_year})` : ""}.)`;
    }
    yield {
      extId: `law:${a.law_id}:art:${num ?? "h" + (a.id ?? heading)}`,
      title,
      content: body,
      metadata: {
        type: "law_article",
        source: "القوانين اليمنية",
        source_tier: "primary",
        category: law.category || "قانون",
        law_id: a.law_id,
        law_title: lawTitle,
        law_number: law.law_number ?? null,
        year: law.year ?? null,
        article_number: num,
        amend_status: a.amend_status ?? null,
        amend_year: a.amend_year ?? null,
      },
    };
  }
}

function* buildLawOverviews(laws, articles) {
  const counts = new Map();
  for (const a of articles) counts.set(a.law_id, (counts.get(a.law_id) || 0) + 1);
  for (const l of laws) {
    const n = counts.get(l.id) || 0;
    const title = `${l.title}${l.law_number ? ` — رقم (${l.law_number})` : ""}${l.year ? ` لسنة ${l.year}م` : ""}`;
    yield {
      extId: `law:${l.id}:overview`,
      title,
      content: `# ${title}\n\nتصنيف: ${l.category || "قانون"}. عدد المواد: ${n}.\n\nنصّ ${l.category || "القانون"} «${l.title}»${l.law_number ? ` رقم (${l.law_number})` : ""}${l.year ? ` لسنة ${l.year}م` : ""} متوفّر كاملاً في التطبيق، مقسّماً إلى ${n} مادة.`,
      metadata: {
        type: "law_overview",
        source: "القوانين اليمنية",
        source_tier: "primary",
        category: l.category || "قانون",
        law_id: l.id,
        law_title: l.title,
        law_number: l.law_number ?? null,
        year: l.year ?? null,
        article_count: n,
      },
    };
  }
}

function* buildJudgments(jdata) {
  for (const coll of jdata.collections || []) {
    for (const r of coll.rules || []) {
      const subject = (r.subject || "").trim();
      const content = (r.content || "").trim();
      if (!subject && !content) continue;
      const body = content ? `${subject}\n\n${content}` : subject;
      const caseNo = r.case ? String(r.case) : "";
      yield {
        extId: `ruling:${coll.issueNum}:${r.n ?? caseNo}`,
        title: `قاعدة قضائية — ${coll.collection}${caseNo ? ` — قضية ${caseNo}` : ""}`,
        content: body,
        metadata: {
          type: "judgment",
          source: "الأحكام القضائية — المحكمة العليا اليمنية",
          source_tier: "judgment",
          category: coll.category || "أحكام",
          collection: coll.collection,
          issue_num: coll.issueNum,
          rule_number: r.n ?? null,
          case_number: caseNo || null,
          page: r.page ?? null,
          has_full_text: Boolean(content),
        },
      };
    }
  }
}

// ————————————————————————————— تجميع كل الوثائق —————————————————————————————
function collectDocuments(only) {
  const docs = [];
  const laws = want(only, "laws") || want(only, "articles") ? asArray(readJson(path.join(DATA, "laws.json"))) : [];
  const articles = want(only, "articles") ? asArray(readJson(path.join(DATA, "articles.json"))) : [];

  if (want(only, "laws")) for (const d of buildLawOverviews(laws, articles.length ? articles : asArray(readJson(path.join(DATA, "articles.json"))))) docs.push(d);
  if (want(only, "articles")) for (const d of buildLawArticles(laws, articles)) docs.push(d);
  if (want(only, "judgments")) for (const d of buildJudgments(readJson(path.join(DATA, "judgments.json")))) docs.push(d);
  if (want(only, "app")) for (const d of buildAppDocs()) docs.push(d);
  return docs;
}

function summarize(docs) {
  const byType = {};
  let chars = 0;
  for (const d of docs) {
    byType[d.metadata.type] = (byType[d.metadata.type] || 0) + 1;
    chars += d.content.length;
  }
  return { total: docs.length, byType, approxChars: chars };
}

// ————————————————————————————— الإخراج للقرص —————————————————————————————
function writeOut(dir, docs, summary) {
  fs.mkdirSync(dir, { recursive: true });
  const ndjson = docs
    .map((d) => JSON.stringify({ title: d.title, content: d.content, metadata: { ...d.metadata, ext_id: d.extId } }))
    .join("\n");
  fs.writeFileSync(path.join(dir, "documents.ndjson"), ndjson + "\n");
  fs.writeFileSync(path.join(dir, "summary.json"), JSON.stringify(summary, null, 2));
  // عيّنات للتفتيش
  const samples = {};
  for (const d of docs) if (!samples[d.metadata.type]) samples[d.metadata.type] = d;
  fs.writeFileSync(path.join(dir, "samples.json"), JSON.stringify(Object.values(samples), null, 2));
}

// ————————————————————————————— الإدخال إلى الخادم —————————————————————————————
async function postDoc(base, token, doc) {
  const res = await fetch(`${base}/documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ title: doc.title, content: doc.content, metadata: { ...doc.metadata, ext_id: doc.extId } }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${t.slice(0, 200)}`);
  }
  return res.json().catch(() => ({}));
}

async function ingest(base, token, docs, { concurrency, progressPath }) {
  let done = new Set();
  if (fs.existsSync(progressPath)) {
    try { done = new Set(JSON.parse(fs.readFileSync(progressPath, "utf8")).done || []); } catch {}
  }
  const pending = docs.filter((d) => !done.has(d.extId));
  console.log(`الإدخال: ${pending.length} وثيقة (تخطّى ${done.size} مُدخَلة سابقاً)…`);

  let i = 0, ok = 0, fail = 0;
  const errors = [];
  const flush = () => fs.writeFileSync(progressPath, JSON.stringify({ done: [...done] }));

  async function worker() {
    while (i < pending.length) {
      const d = pending[i++];
      try {
        await postDoc(base, token, d);
        done.add(d.extId); ok++;
      } catch (e) {
        fail++; errors.push({ extId: d.extId, error: String(e.message || e) });
      }
      if ((ok + fail) % 200 === 0) { flush(); process.stdout.write(`  …${ok + fail}/${pending.length} (نجح ${ok}، فشل ${fail})\n`); }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  flush();
  if (errors.length) fs.writeFileSync(progressPath.replace(/\.json$/, ".errors.json"), JSON.stringify(errors.slice(0, 500), null, 2));
  console.log(`تمّ: نجح ${ok}، فشل ${fail}${errors.length ? ` (سُجّلت الأخطاء في ${path.basename(progressPath).replace(/\.json$/, ".errors.json")})` : ""}.`);
  return { ok, fail };
}

// ————————————————————————————— main —————————————————————————————
async function main() {
  const a = parseArgs(process.argv.slice(2));
  let docs = collectDocuments(a.only);
  if (a.limit) docs = docs.slice(0, a.limit);
  const summary = summarize(docs);
  console.log("المجموعة:", JSON.stringify(summary));

  if (a.dry) return;

  if (a.out) {
    writeOut(a.out, docs, summary);
    console.log(`أُخرجت ${docs.length} وثيقة إلى ${a.out}/documents.ndjson (+ summary.json, samples.json).`);
  }
  if (a.url) {
    const progressPath = a.out ? path.join(a.out, ".progress.json") : path.join(ROOT, ".nexus-ingest-progress.json");
    await ingest(a.url, a.token, docs, { concurrency: a.concurrency, progressPath });
  }
  if (!a.out && !a.url) {
    console.log("لا إجراء: مرّر --out <dir> للإخراج أو --url <host> للإدخال. (--dry للعدّ فقط)");
  }
}

main().catch((e) => { console.error("خطأ:", e); process.exit(1); });
