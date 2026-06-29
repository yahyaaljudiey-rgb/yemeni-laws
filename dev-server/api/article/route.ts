import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

// جلب مادة محدّدة برقمها داخل قانون معيّن (للإحالات المرجعية القابلة للنقر)
export async function POST(req: NextRequest) {
  try {
    const { law_id, article_number } = (await req.json()) as {
      law_id?: number;
      article_number?: string | number;
    };
    if (!law_id || article_number == null) {
      return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });
    }

    const db = getDb();
    const article = db
      .prepare(
        `SELECT a.id AS article_id, a.law_id, a.article_number, a.heading, a.content,
                a.amend_year, a.amend_status, a.amend_note,
                l.title AS law_title, l.law_number, l.year, l.category
         FROM articles a JOIN laws l ON l.id = a.law_id
         WHERE a.law_id = ? AND a.article_number = ?
         LIMIT 1`,
      )
      .get(law_id, String(article_number));

    return NextResponse.json({ article: article ?? null });
  } catch (err) {
    console.error("article fetch error:", err);
    const message = err instanceof Error ? err.message : "خطأ غير متوقع";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
