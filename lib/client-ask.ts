// سؤال وجواب ذكي في المتصفّح (offline-first، بلا خادم).
// يسترجع المواد الأكثر صلة من الحزمة الثابتة محلياً، ثم يسأل Claude مباشرةً
// من المتصفّح بمفتاح المستخدم (BYOK). لا يمرّ أيّ مفتاح أو سؤال عبر خادمنا.

import { clientSearch, type ClientHit } from "./client-search";

export const CLAUDE_MODELS = [
  { id: "claude-opus-4-8", label: "Opus 4.8 — الأقوى (الأغلى)" },
  { id: "claude-sonnet-5", label: "Sonnet 5 — متوازن" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5 — الأسرع والأرخص" },
] as const;
export const DEFAULT_CLAUDE_MODEL = "claude-opus-4-8";

export interface AskSource {
  article_id: number;
  law_id: number;
  law_title: string;
  law_number: string | null;
  year: string | null;
  article_number: string | null;
}

export interface AskResult {
  answer: string;
  sources: AskSource[];
}

const SYSTEM_PROMPT = `أنت مساعد قانوني متخصص في القوانين اليمنية. مهمتك الإجابة على أسئلة المستخدم بالاعتماد حصراً على نصوص المواد القانونية المرفقة في "المراجع".

قواعد صارمة:
- اعتمد فقط على المواد المرفقة. لا تخترع مواد أو أرقاماً أو أحكاماً غير موجودة فيها.
- إذا لم تكفِ المراجع للإجابة، اذكر ذلك بوضوح واطلب من المستخدم البحث بصياغة أخرى أو رفع القانون المعني.
- استشهد بأرقام المواد وأسماء القوانين التي استندت إليها داخل إجابتك (مثال: "وفقاً للمادة (5) من ...").
- أجب بالعربية الفصحى بأسلوب واضح ومنظَّم.
- لا تقدّم استشارة قانونية نهائية، بل اشرح ما تنص عليه النصوص، وذكّر بأن المرجع النهائي هو النص الرسمي للقانون والمختص القانوني.`;

// بناء كتلة المراجع التي تُمرَّر إلى النموذج
function buildContextBlock(articles: ClientHit[]): string {
  return articles
    .map((a, i) => {
      const ref = [
        `[مرجع ${i + 1}]`,
        a.law_title,
        a.law_number ? `رقم ${a.law_number}` : "",
        a.year ? `لسنة ${a.year}` : "",
        a.article_number ? `— المادة (${a.article_number})` : "",
      ]
        .filter(Boolean)
        .join(" ");
      return `${ref}\n${a.content}`;
    })
    .join("\n\n---\n\n");
}

// يسأل Claude مباشرةً من المتصفّح بمفتاح المستخدم، بعد استرجاع المواد محلياً.
export async function clientAsk(
  question: string,
  apiKey: string,
  model: string = DEFAULT_CLAUDE_MODEL,
  knowledge?: string,
  k = 8,
): Promise<AskResult> {
  const q = question.trim();
  if (!q) throw new Error("الرجاء إدخال سؤال");
  const key = apiKey.trim();
  if (!key) {
    throw new Error(
      "ميزة السؤال والجواب الذكية تتطلب مفتاح Claude API خاصّاً بك. أدخِل مفتاحك من زرّ «الذكاء الاصطناعي» ليُحفَظ على جهازك.",
    );
  }

  // 1) استرجاع المواد الأكثر صلة محلياً (نفس محرّك البحث الدلالي)
  const context = await clientSearch(q, Math.min(Math.max(k, 1), 15));
  // لا مواد؟ قد يكون سؤالاً عن التطبيق/الحاسبات/الميزات — نُجيب من «معرفة التطبيق».
  if (context.length === 0 && !knowledge?.trim()) {
    return {
      answer:
        "لم أعثر على مواد قانونية تتّصل بسؤالك في المكتبة. الرجاء إعادة صياغة السؤال بكلمات أخرى.",
      sources: [],
    };
  }

  // 2) سؤال Claude مباشرةً من المتصفّح (BYOK). dangerouslyAllowBrowser مقصود:
  //    المفتاح يخصّ المستخدم نفسه ومحفوظ على جهازه، ولا يُرسَل لأيّ خادم وسيط.
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
  const contextBlock = buildContextBlock(context);

  // Haiku 4.5 لا يقبل thinking: adaptive (يُعطي خطأ)؛ نُفعّل التفكير لمن يدعمه فقط.
  const supportsAdaptive = model !== "claude-haiku-4-5";
  // نضمّ «معرفة التطبيق» للنظام ليجيب أيضاً عن الحاسبات والميزات والمطوّرين ونطاق المحتوى.
  const system = knowledge?.trim()
    ? `${SYSTEM_PROMPT}\n\nإضافةً إلى المواد المرفقة، إليك معلومات موثوقة عن التطبيق نفسه (ميزاته وحاسباته ونطاقه ومعدّيه). استعِن بها للإجابة عن الأسئلة المتعلّقة بالتطبيق والحاسبات وكيفية الاستخدام والمحتوى المتاح:\n\n${knowledge.trim()}`
    : SYSTEM_PROMPT;
  const userContent = contextBlock
    ? `المراجع (مواد قانونية يمنية):\n\n${contextBlock}\n\n---\n\nالسؤال: ${q}`
    : `السؤال: ${q}`;
  const stream = client.messages.stream({
    model,
    max_tokens: 2048,
    ...(supportsAdaptive ? { thinking: { type: "adaptive" as const } } : {}),
    system,
    messages: [{ role: "user", content: userContent }],
  });

  const message = await stream.finalMessage();
  const answer = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("\n")
    .trim();

  const sources: AskSource[] = context.map((a) => ({
    article_id: a.article_id,
    law_id: a.law_id,
    law_title: a.law_title,
    law_number: a.law_number,
    year: a.year,
    article_number: a.article_number,
  }));

  return { answer, sources };
}
