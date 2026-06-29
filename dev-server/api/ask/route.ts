import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getDb, blobToVector } from "@/lib/db";
import { embed, cosineSim } from "@/lib/embeddings";

export const runtime = "nodejs";
export const maxDuration = 300;

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

// مادة مُسترجَعة تُستخدم كسياق للإجابة
interface ContextArticle {
  article_id: number;
  law_id: number;
  law_title: string;
  law_number: string | null;
  year: string | null;
  article_number: string | null;
  content: string;
  score: number;
}

// استرجاع أكثر المواد صلة بالسؤال (نفس منطق البحث الدلالي)
async function retrieveContext(
  question: string,
  k: number,
): Promise<ContextArticle[]> {
  const db = getDb();
  const queryVec = await embed(question, "query");

  const rows = db
    .prepare(`SELECT id, embedding FROM articles WHERE embedding IS NOT NULL`)
    .all() as { id: number; embedding: Buffer }[];

  const scored = rows
    .map((row) => ({
      id: row.id,
      score: cosineSim(queryVec, blobToVector(row.embedding)),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);

  if (scored.length === 0) return [];

  const ids = scored.map((s) => s.id);
  const placeholders = ids.map(() => "?").join(",");
  const details = db
    .prepare(
      `SELECT a.id AS article_id, a.law_id, a.article_number, a.content,
              l.title AS law_title, l.law_number, l.year
       FROM articles a JOIN laws l ON l.id = a.law_id
       WHERE a.id IN (${placeholders})`,
    )
    .all(...ids) as Omit<ContextArticle, "score">[];

  const byId = new Map(details.map((d) => [d.article_id, d]));
  return scored
    .map((s) => {
      const d = byId.get(s.id);
      return d ? { ...d, score: s.score } : null;
    })
    .filter((a): a is ContextArticle => a !== null);
}

// بناء كتلة المراجع التي تُمرَّر إلى النموذج
function buildContextBlock(articles: ContextArticle[]): string {
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

const SYSTEM_PROMPT = `أنت مساعد قانوني متخصص في القوانين اليمنية. مهمتك الإجابة على أسئلة المستخدم بالاعتماد حصراً على نصوص المواد القانونية المرفقة في "المراجع".

قواعد صارمة:
- اعتمد فقط على المواد المرفقة. لا تخترع مواد أو أرقاماً أو أحكاماً غير موجودة فيها.
- إذا لم تكفِ المراجع للإجابة، اذكر ذلك بوضوح واطلب من المستخدم البحث بصياغة أخرى أو رفع القانون المعني.
- استشهد بأرقام المواد وأسماء القوانين التي استندت إليها داخل إجابتك (مثال: "وفقاً للمادة (5) من ...").
- أجب بالعربية الفصحى بأسلوب واضح ومنظَّم.
- لا تقدّم استشارة قانونية نهائية، بل اشرح ما تنص عليه النصوص، وذكّر بأن المرجع النهائي هو النص الرسمي للقانون والمختص القانوني.`;

export async function POST(req: NextRequest) {
  try {
    const {
      question,
      k = 8,
      apiKey: userKey,
    } = (await req.json()) as {
      question?: string;
      k?: number;
      apiKey?: string;
    };

    if (!question || !question.trim()) {
      return NextResponse.json(
        { error: "الرجاء إدخال سؤال" },
        { status: 400 },
      );
    }

    // أولوية مفتاح المستخدم (BYOK) ثم مفتاح البيئة (إن وُجد)
    const apiKey = (userKey && userKey.trim()) || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "ميزة السؤال والجواب الذكية تتطلب مفتاح Claude API خاصّاً بك. أدخِل مفتاحك من زرّ «الذكاء الاصطناعي» ليُحفَظ على جهازك. ويمكنك حالياً استخدام البحث الدلالي مجاناً بلا مفتاح.",
          needsApiKey: true,
        },
        { status: 503 },
      );
    }

    // 1) استرجاع المواد الأكثر صلة كسياق
    const context = await retrieveContext(question, Math.min(Math.max(k, 1), 15));

    if (context.length === 0) {
      return NextResponse.json({
        answer:
          "لا توجد مواد قانونية في المكتبة بعد، أو لم أعثر على ما يتصل بسؤالك. الرجاء رفع القوانين أولاً من صفحة الإدارة، أو إعادة صياغة السؤال.",
        sources: [],
      });
    }

    // 2) سؤال Claude بالاعتماد على المراجع
    const client = new Anthropic({ apiKey });
    const contextBlock = buildContextBlock(context);

    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 2048,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `المراجع (مواد قانونية يمنية):\n\n${contextBlock}\n\n---\n\nالسؤال: ${question}`,
        },
      ],
    });

    const message = await stream.finalMessage();
    const answer = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n")
      .trim();

    const sources = context.map((a) => ({
      article_id: a.article_id,
      law_id: a.law_id,
      law_title: a.law_title,
      law_number: a.law_number,
      year: a.year,
      article_number: a.article_number,
    }));

    return NextResponse.json({ answer, sources });
  } catch (err) {
    console.error("ask error:", err);
    const message = err instanceof Error ? err.message : "خطأ غير متوقع";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
