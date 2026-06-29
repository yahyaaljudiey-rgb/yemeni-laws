import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

// جلب كل مواد وثيقة واحدة بالترتيب (لعرضها ككتاب في وضع التصفّح)
export async function POST(req: NextRequest) {
  try {
    const { law_id } = (await req.json()) as { law_id?: number };
    if (!law_id) {
      return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });
    }

    const db = getDb();
    const law = db
      .prepare(
        `SELECT id, title, law_number, year, category FROM laws WHERE id = ? LIMIT 1`,
      )
      .get(law_id);
    if (!law) {
      return NextResponse.json({ error: "الوثيقة غير موجودة" }, { status: 404 });
    }

    const articles = db
      .prepare(
        `SELECT a.id AS article_id, a.law_id, a.article_number, a.heading, a.content,
                a.amend_year, a.amend_status, a.amend_note,
                l.title AS law_title, l.law_number, l.year, l.category
         FROM articles a JOIN laws l ON l.id = a.law_id
         WHERE a.law_id = ?
         ORDER BY a.ordering, a.id`,
      )
      .all(law_id);

    return NextResponse.json({ law, articles });
  } catch (err) {
    console.error("law fetch error:", err);
    const message = err instanceof Error ? err.message : "خطأ غير متوقع";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
