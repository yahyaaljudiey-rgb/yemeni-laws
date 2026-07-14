// تصدير وثيقة قانونية أنيقة كـ PDF عبر طباعة المتصفّح الأصلية (Save as PDF).
// يعمل أوفلاين وبتشكيل عربي سليم لأنه يستخدم خطّ Amiri المحمّل أصلاً في التطبيق،
// ويطبع داخل الصفحة نفسها عبر عنصر «print-root» تُظهره أنماط @media print وحدها.

export interface LegalDocMeta {
  label: string;
  value: string;
}

export interface LegalDoc {
  kind: "memo" | "ruling" | "article";
  title: string; // العنوان الرئيسي (اسم القانون/المحكمة أو «مذكرة قانونية»)
  subtitle?: string; // سطر فرعي (المجموعة/التصنيف)
  meta?: LegalDocMeta[]; // بنود تعريفية (رقم القضية، الصفحة، رقم القانون…)
  question?: string; // سؤال المستخدم (لمذكرة الشات)
  bodyText: string; // المتن (يقبل **غليظ**، تنقيط، «1.» ترقيم، عناوين #، وعزو [n])
  citations?: string[]; // المصادر
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// تحويل سطر إلى HTML آمن مع الغليظ والعزو (يُطبَّق بعد الهروب)
function inlineHtml(line: string): string {
  return esc(line)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[(\d+(?:\s*[,،]\s*\d+)*)\]/g, '<sup class="cite">[$1]</sup>');
}

// تحويل متن (Markdown خفيف) إلى HTML: عناوين، تنقيط، ترقيم، فقرات
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
      const lvl = h[1].length + 2; // # -> h3
      out.push(`<h${lvl}>${inlineHtml(h[2])}</h${lvl}>`);
      continue;
    }
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const ul = /^\s*[*\-•]\s+(.*)$/.exec(line);
    if (ol) {
      if (list !== "ol") {
        closeList();
        out.push("<ol>");
        list = "ol";
      }
      out.push(`<li>${inlineHtml(ol[1])}</li>`);
      continue;
    }
    if (ul) {
      if (list !== "ul") {
        closeList();
        out.push("<ul>");
        list = "ul";
      }
      out.push(`<li>${inlineHtml(ul[1])}</li>`);
      continue;
    }
    closeList();
    out.push(`<p>${inlineHtml(line)}</p>`);
  }
  closeList();
  return out.join("\n");
}

const KIND_LABEL: Record<LegalDoc["kind"], string> = {
  memo: "مذكرة قانونية استرشادية",
  ruling: "قاعدة قضائية",
  article: "نصّ قانوني",
};

function todayAr(): string {
  return new Intl.DateTimeFormat("ar", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());
}

// أنماط الوثيقة — تُحقن مرّة واحدة
function ensureStyles(): void {
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
.yl-print-root {
  font-family: var(--font-amiri), "Amiri", "Noto Naskh Arabic", "Traditional Arabic", serif;
  color: #1a1a1a; direction: rtl; text-align: right;
  line-height: 2.05; font-size: 13.5pt;
}
.yl-print-root .doc-head { text-align: center; border-bottom: 2.5px double #b08d3a; padding-bottom: 10px; margin-bottom: 6px; }
.yl-print-root .doc-brand { font-size: 11pt; color: #6b5a2a; letter-spacing: .5px; }
.yl-print-root .doc-kind { font-size: 10.5pt; color: #8a7a4a; margin-top: 2px; }
.yl-print-root .doc-title { font-size: 19pt; font-weight: 700; color: #1f3a2e; margin: 12px 0 2px; }
.yl-print-root .doc-subtitle { font-size: 12.5pt; color: #40513f; }
.yl-print-root .doc-meta { display: flex; flex-wrap: wrap; gap: 4px 20px; justify-content: center; font-size: 10.5pt; color: #555; margin: 8px 0 4px; }
.yl-print-root .doc-meta b { color: #1f3a2e; font-weight: 700; }
.yl-print-root .doc-q { background: #f6f3ea; border-inline-start: 3px solid #b08d3a; padding: 8px 12px; border-radius: 6px; margin: 14px 0; font-size: 12.5pt; }
.yl-print-root .doc-q .lbl { font-weight: 700; color: #6b5a2a; }
.yl-print-root .doc-body { margin-top: 12px; }
.yl-print-root .doc-body h3, .yl-print-root .doc-body h4, .yl-print-root .doc-body h5 { color: #1f3a2e; font-size: 14pt; margin: 14px 0 4px; }
.yl-print-root .doc-body p { margin: 6px 0; text-align: justify; }
.yl-print-root .doc-body ul, .yl-print-root .doc-body ol { margin: 6px 24px 6px 0; padding: 0; }
.yl-print-root .doc-body li { margin: 3px 0; }
.yl-print-root .doc-body .cite { color: #9a7a1e; font-weight: 700; font-size: .68em; vertical-align: super; }
.yl-print-root .doc-body strong { color: #1f3a2e; }
.yl-print-root .doc-sources { margin-top: 16px; border-top: 1px solid #d8cfb6; padding-top: 8px; font-size: 11pt; }
.yl-print-root .doc-sources .lbl { font-weight: 700; color: #6b5a2a; }
.yl-print-root .doc-sources ol { margin: 4px 22px 0 0; }
.yl-print-root .doc-foot { margin-top: 22px; border-top: 2px double #b08d3a; padding-top: 8px; font-size: 9.5pt; color: #6a6a6a; display: flex; justify-content: space-between; }
.yl-print-root .doc-foot .sign { color: #6b5a2a; font-weight: 700; }
.yl-print-root .doc-disclaimer { margin-top: 6px; font-size: 9pt; color: #8a8a8a; text-align: center; font-style: italic; }
`;
  const style = document.createElement("style");
  style.id = "yl-print-styles";
  style.textContent = css;
  document.head.appendChild(style);
}

/** يبني الوثيقة ويفتح حوار الطباعة (المستخدم يختار «حفظ كـ PDF»). */
export function exportLegalPdf(doc: LegalDoc): void {
  if (typeof window === "undefined") return;
  ensureStyles();

  let root = document.querySelector(".yl-print-root") as HTMLElement | null;
  if (!root) {
    root = document.createElement("div");
    root.className = "yl-print-root";
    document.body.appendChild(root);
  }

  const meta = (doc.meta ?? []).filter((m) => m.value?.trim());
  const metaHtml = meta.length
    ? `<div class="doc-meta">${meta
        .map((m) => `<span><b>${esc(m.label)}:</b> ${esc(m.value)}</span>`)
        .join("")}</div>`
    : "";
  const qHtml = doc.question?.trim()
    ? `<div class="doc-q"><span class="lbl">السؤال:</span> ${esc(doc.question.trim())}</div>`
    : "";
  const citations = (doc.citations ?? []).filter((c) => c?.trim());
  const sourcesHtml = citations.length
    ? `<div class="doc-sources"><span class="lbl">المصادر:</span><ol>${citations
        .map((c) => `<li>${esc(c)}</li>`)
        .join("")}</ol></div>`
    : "";

  root.innerHTML = `
    <div class="doc-head">
      <div class="doc-brand">⚖️ القوانين اليمنية</div>
      <div class="doc-kind">${esc(KIND_LABEL[doc.kind])}</div>
      <div class="doc-title">${esc(doc.title)}</div>
      ${doc.subtitle ? `<div class="doc-subtitle">${esc(doc.subtitle)}</div>` : ""}
    </div>
    ${metaHtml}
    ${qHtml}
    <div class="doc-body">${bodyHtml(doc.bodyText)}</div>
    ${sourcesHtml}
    <div class="doc-foot">
      <span>${esc(todayAr())}</span>
      <span class="sign">تطبيق القوانين اليمنية</span>
    </div>
    <div class="doc-disclaimer">وثيقة استرشادية لا تُغني عن النصّ الرسمي للقانون والمختصّ القانوني.</div>
  `;

  const cleanup = () => {
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  // مهلة صغيرة ليضمن المتصفّح تطبيق الأنماط قبل فتح الحوار
  setTimeout(() => window.print(), 60);
}
