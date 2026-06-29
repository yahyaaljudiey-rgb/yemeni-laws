// سؤال وجواب ذكي في المتصفّح (offline-first، بلا خادم).
// يسترجع المواد الأكثر صلة من الحزمة الثابتة محلياً، ثم يسأل Claude مباشرةً
// من المتصفّح بمفتاح المستخدم (BYOK). لا يمرّ أيّ مفتاح أو سؤال عبر خادمنا.

import { clientSearch, type ClientHit } from "./client-search";

const MODEL = "claude-opus-4-8";

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
  if (context.length === 0) {
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

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 2048,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `المراجع (مواد قانونية يمنية):\n\n${contextBlock}\n\n---\n\nالسؤال: ${q}`,
      },
    ],
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
