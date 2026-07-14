// تصدير وثيقة قانونية أنيقة بهوية التطبيق (كحلي + ذهبي) وخطوط عربية:
//   exportLegalPdf   — طباعة/حفظ PDF عبر طباعة المتصفّح (تشكيل عربي سليم، أوفلاين).
//   downloadLegalWord — تنزيل ملفّ Word (.doc) منسّق يفتحه Word مباشرةً.
//   copyLegalRich    — نسخ منسّق للحافظة يُلصَق في Word محتفظاً بالتنسيق.
// المحتوى نفسه لكل المخارج (بناء HTML موحّد).

export interface LegalDocMeta {
  label: string;
  value: string;
}

export interface LegalDoc {
  kind: "memo" | "ruling" | "article";
  title: string;
  subtitle?: string;
  meta?: LegalDocMeta[];
  question?: string;
  bodyText: string; // يقبل **غليظ**، تنقيط، «1.» ترقيم، عناوين #، وعزو [n]
  citations?: string[];
}

// ————————————————————————— هوية الألوان —————————————————————————
const C = {
  navy: "#12294d",
  navyDeep: "#0c1c38",
  gold: "#b5891d",
  goldLight: "#d4af37",
  ink: "#14203a",
  muted: "#5b6775",
  paper: "#ffffff",
  tint: "#f6f4ec", // ذهبي باهت للاقتباس
};
const AR_FONTS =
  '"Amiri", "Traditional Arabic", "Simplified Arabic", "Noto Naskh Arabic", "Times New Roman", serif';

const KIND_LABEL: Record<LegalDoc["kind"], string> = {
  memo: "مذكرة قانونية استرشادية",
  ruling: "قاعدة قضائية",
  article: "نصّ قانوني",
};

// ————————————————————————— أدوات نصّية —————————————————————————
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inlineHtml(line: string): string {
  return esc(line)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(
      /\[(\d+(?:\s*[,،]\s*\d+)*)\]/g,
      `<sup style="color:${C.gold};font-weight:700;font-size:.68em;vertical-align:super">[$1]</sup>`,
    );
}

// تحويل المتن (Markdown خفيف) إلى HTML: عناوين/تنقيط/ترقيم/فقرات
function bodyHtml(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      closeList();
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      closeList();
      out.push(
        `<h3 style="color:${C.navy};font-size:15pt;margin:14px 0 4px">${inlineHtml(h[2])}</h3>`,
      );
      continue;
    }
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const ul = /^\s*[*\-•]\s+(.*)$/.exec(line);
    if (ol) {
      if (list !== "ol") {
        closeList();
        out.push('<ol style="margin:6px 26px 6px 0;padding:0">');
        list = "ol";
      }
      out.push(`<li style="margin:3px 0">${inlineHtml(ol[1])}</li>`);
      continue;
    }
    if (ul) {
      if (list !== "ul") {
        closeList();
        out.push('<ul style="margin:6px 26px 6px 0;padding:0">');
        list = "ul";
      }
      out.push(`<li style="margin:3px 0">${inlineHtml(ul[1])}</li>`);
      continue;
    }
    closeList();
    out.push(
      `<p style="margin:6px 0;text-align:justify">${inlineHtml(line)}</p>`,
    );
  }
  closeList();
  return out.join("\n");
}

function todayAr(): string {
  return new Intl.DateTimeFormat("ar", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());
}

// ————————————————————————— بناء متن الوثيقة (مشترك) —————————————————————————
// inline styles لأن Word ونسخ الحافظة لا يقرآن CSS خارجياً.
function docInnerHtml(doc: LegalDoc): string {
  const meta = (doc.meta ?? []).filter((m) => m.value?.trim());
  const metaHtml = meta.length
    ? `<div style="text-align:center;font-size:10.5pt;color:${C.muted};margin:8px 0 4px">${meta
        .map(
          (m) =>
            `<span style="margin:0 12px"><b style="color:${C.navy}">${esc(m.label)}:</b> ${esc(m.value)}</span>`,
        )
        .join("")}</div>`
    : "";
  const qHtml = doc.question?.trim()
    ? `<div style="background:${C.tint};border-right:3px solid ${C.gold};padding:8px 12px;border-radius:6px;margin:14px 0;font-size:12.5pt"><span style="font-weight:700;color:${C.gold}">السؤال:</span> ${esc(doc.question.trim())}</div>`
    : "";
  const citations = (doc.citations ?? []).filter((c) => c?.trim());
  const sourcesHtml = citations.length
    ? `<div style="margin-top:16px;border-top:1px solid #d8cfb6;padding-top:8px;font-size:11pt"><span style="font-weight:700;color:${C.gold}">المصادر:</span><ol style="margin:4px 24px 0 0">${citations
        .map((c) => `<li>${esc(c)}</li>`)
        .join("")}</ol></div>`
    : "";

  return `
    <div style="text-align:center;border-bottom:2.5px double ${C.gold};padding-bottom:10px;margin-bottom:6px">
      <div style="font-size:11pt;color:${C.navyDeep};letter-spacing:.5px">⚖️ القوانين اليمنية</div>
      <div style="font-size:10.5pt;color:${C.gold}">${esc(KIND_LABEL[doc.kind])}</div>
      <div style="font-size:19pt;font-weight:700;color:${C.navy};margin:12px 0 2px">${esc(doc.title)}</div>
      ${doc.subtitle ? `<div style="font-size:12.5pt;color:${C.muted}">${esc(doc.subtitle)}</div>` : ""}
    </div>
    ${metaHtml}
    ${qHtml}
    <div style="margin-top:12px">${bodyHtml(doc.bodyText)}</div>
    ${sourcesHtml}
    <div style="margin-top:22px;border-top:2px double ${C.gold};padding-top:8px;font-size:9.5pt;color:${C.muted};display:flex;justify-content:space-between">
      <span>${esc(todayAr())}</span>
      <span style="color:${C.gold};font-weight:700">تطبيق القوانين اليمنية</span>
    </div>
    <div style="margin-top:6px;font-size:9pt;color:#8a8a8a;text-align:center;font-style:italic">وثيقة استرشادية لا تُغني عن النصّ الرسمي للقانون والمختصّ القانوني.</div>
  `;
}

// وثيقة HTML كاملة (لـ Word والنسخ) مع اتّجاه RTL وخطّ عربي
function fullHtmlDocument(doc: LegalDoc): string {
  return `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"><title>${esc(doc.title)}</title></head>
<body dir="rtl" style="font-family:${AR_FONTS};color:${C.ink};direction:rtl;text-align:right;line-height:1.9;font-size:13.5pt">
${docInnerHtml(doc)}
</body></html>`;
}

function safeFileName(doc: LegalDoc): string {
  const base = `${KIND_LABEL[doc.kind]} - ${doc.title}`
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return base || "وثيقة قانونية";
}

// ————————————————————————— (1) طباعة/PDF —————————————————————————
function ensurePrintStyles(): void {
  if (document.getElementById("yl-print-styles")) return;
  const css = `
.yl-print-root { display: none; }
@media screen { .yl-print-root { display: none !important; } }
@media print {
  body > *:not(.yl-print-root) { display: none !important; }
  .yl-print-root { display: block !important; }
  @page { size: A4; margin: 20mm 18mm; }
  html, body { background: #fff !important; }
}
.yl-print-root { font-family: ${AR_FONTS.replace(/"/g, "'")}; direction: rtl; text-align: right; }`;
  const style = document.createElement("style");
  style.id = "yl-print-styles";
  style.textContent = css;
  document.head.appendChild(style);
}

/** يبني الوثيقة ويفتح حوار الطباعة (المستخدم يختار «حفظ كـ PDF»). */
export function exportLegalPdf(doc: LegalDoc): void {
  if (typeof window === "undefined") return;
  ensurePrintStyles();
  let root = document.querySelector(".yl-print-root") as HTMLElement | null;
  if (!root) {
    root = document.createElement("div");
    root.className = "yl-print-root";
    document.body.appendChild(root);
  }
  root.innerHTML = docInnerHtml(doc);
  setTimeout(() => window.print(), 60);
}

// ————————————————————————— (2) تنزيل Word (.doc) —————————————————————————
/** ينزّل ملفّ Word (.doc) منسّقاً بهوية التطبيق يفتحه Word مباشرةً. */
export function downloadLegalWord(doc: LegalDoc): void {
  if (typeof window === "undefined") return;
  const html = fullHtmlDocument(doc);
  const blob = new Blob(["﻿", html], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeFileName(doc)}.doc`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ————————————————————————— (3) نسخ منسّق (يُلصَق في Word) —————————————————————————
/** ينسخ الوثيقة منسّقةً للحافظة؛ اللصق في Word يحفظ التنسيق. يعيد true عند النجاح. */
export async function copyLegalRich(doc: LegalDoc): Promise<boolean> {
  if (typeof navigator === "undefined") return false;
  const html = fullHtmlDocument(doc);
  const plain = plainTextOf(doc);
  try {
    if (navigator.clipboard && "write" in navigator.clipboard && typeof ClipboardItem !== "undefined") {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        }),
      ]);
      return true;
    }
    await navigator.clipboard.writeText(plain);
    return true;
  } catch {
    try {
      await navigator.clipboard.writeText(plain);
      return true;
    } catch {
      return false;
    }
  }
}

// نصّ عاديّ للوثيقة (احتياط النسخ)
function plainTextOf(doc: LegalDoc): string {
  const parts: string[] = [`⚖️ القوانين اليمنية — ${KIND_LABEL[doc.kind]}`, doc.title];
  if (doc.subtitle) parts.push(doc.subtitle);
  for (const m of doc.meta ?? []) if (m.value?.trim()) parts.push(`${m.label}: ${m.value}`);
  if (doc.question?.trim()) parts.push(`\nالسؤال: ${doc.question.trim()}`);
  parts.push("\n" + doc.bodyText.replace(/\*\*(.+?)\*\*/g, "$1"));
  const cites = (doc.citations ?? []).filter((c) => c?.trim());
  if (cites.length) parts.push("\nالمصادر:\n" + cites.map((c, i) => `${i + 1}. ${c}`).join("\n"));
  parts.push(`\n${todayAr()} — عبر تطبيق القوانين اليمنية`);
  return parts.join("\n");
}
