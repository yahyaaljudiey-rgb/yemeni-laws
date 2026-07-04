import type { ClientHit } from "./client-search";
import type { NexusMessage } from "./nexus-client";

export interface GeminiReply {
  content: string;
  model: string;
}

const MODEL = "gemini-2.5-flash";
const SYSTEM = `أنت مستشار قانوني متخصص في القوانين اليمنية داخل تطبيق قانوني. أجب اعتماداً حصراً على المراجع القانونية التي يرسلها التطبيق. استشهد باسم القانون ورقم المادة. إذا لم تكفِ المراجع فقل ذلك بوضوح ولا تخترع نصاً أو رقماً. نبّه إلى أن القوانين والتعديلات بعد 2014 غير معترف بها وفق سياسة التطبيق. أجب بالعربية الفصحى، ووضّح أن الإجابة استرشادية وأن المرجع النهائي هو النص الرسمي والمختص القانوني.`;

function references(hits: ClientHit[]): string {
  return hits.slice(0, 8).map((hit, index) => {
    const title = [
      `[مرجع ${index + 1}]`,
      hit.law_title,
      hit.law_number ? `رقم (${hit.law_number})` : "",
      hit.year ? `لسنة ${hit.year}` : "",
      hit.article_number ? `المادة (${hit.article_number})` : "",
    ].filter(Boolean).join(" — ");
    return `${title}\n${hit.content.slice(0, 4500)}`;
  }).join("\n\n---\n\n");
}

// توسيع السؤال: يحوّل صياغة المستخدم العاميّة إلى المصطلحات التي ترد فعلاً في
// نصوص القوانين اليمنية (مثال: «التطليق للضرر» → «الفسخ للكراهية، الشقاق»).
// يُستعمل لتحسين استرجاع المواد قبل إرسالها إلى المستشار. يفشل بصمت (يعيد "").
export async function geminiExpandQuery(
  apiKey: string,
  query: string,
): Promise<string> {
  const key = apiKey.trim();
  if (!key) return "";
  const prompt =
    `أنت خبير بمصطلحات التشريع اليمني. حوّل السؤال التالي إلى كلمات ومصطلحات ` +
    `مفتاحية كما ترد في نصوص القوانين اليمنية الرسمية (استعمل ألفاظ التشريع لا ` +
    `العاميّة؛ أمثلة: «تطليق للضرر» ⇒ الفسخ، الكراهية، الشقاق؛ «سجن» ⇒ الحبس؛ ` +
    `«رشوة موظف» ⇒ الرشوة، الموظف العام، الإخلال بواجبات الوظيفة). ` +
    `أعِد المصطلحات مفصولة بفواصل فقط، دون أي شرح أو ترقيم.\n\nالسؤال: ${query}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
        }),
        signal: controller.signal,
      },
    );
    if (!response.ok) return "";
    const data = (await response.json().catch(() => null)) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    } | null;
    const text = data?.candidates?.[0]?.content?.parts
      ?.map((p) => p.text || "")
      .join(" ")
      .trim();
    // نظّف: استبدل الفواصل بمسافات ليصير استعلام بحث واحداً
    return (text || "").replace(/[،,]/g, " ").replace(/\s+/g, " ").trim();
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

export async function geminiChat(
  apiKey: string,
  messages: NexusMessage[],
  hits: ClientHit[],
  calculatorContext?: string,
  appKnowledge?: string,
  userName?: string,
): Promise<GeminiReply> {
  const key = apiKey.trim();
  if (!key) throw new Error("مفتاح Gemini غير موجود");
  const system =
    SYSTEM +
    (userName?.trim()
      ? `\n\nاسم المستخدم: ${userName.trim()}. خاطِبه باسمه بلطف عند بدء الإجابة.`
      : "") +
    (appKnowledge?.trim() ? `\n\n${appKnowledge.trim()}` : "");
  const recent = messages.slice(-10);
  const contents = recent.map((message, index) => {
    const isLast = index === recent.length - 1 && message.role === "user";
    const legalContext = isLast
      ? `${calculatorContext ? `\n\nنتيجة حاسبة التطبيق المحلية (اعتمد أرقامها كما هي ولا تعِد حسابها):\n${calculatorContext}` : ""}\n\nالمراجع القانونية المسترجعة:\n\n${references(hits) || "لا توجد مراجع مطابقة."}`
      : "";
    return {
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: `${message.content}${legalContext}` }],
    };
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents,
          // gemini-2.5-flash موديل «تفكير»: مع سياق قانوني كبير قد يستهلك التفكيرُ
          // الميزانية فيعود الردّ فارغاً. نرفع الحدّ لضمان بقاء نصّ الإجابة.
          generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
        }),
        signal: controller.signal,
      },
    );
    const data = await response.json().catch(() => null) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      error?: { message?: string };
    } | null;
    if (!response.ok) {
      throw new Error(data?.error?.message || `رفض Gemini الطلب (${response.status})`);
    }
    const content = data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("\n")
      .trim();
    if (!content) throw new Error("أعاد Gemini إجابة فارغة أو محجوبة");
    return { content, model: "Gemini 2.5 Flash" };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("انتهت مهلة الاتصال بـGemini");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
