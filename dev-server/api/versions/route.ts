import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

// جلب كل نسخ مادة برقمها داخل قانون (للمقارنة قبل/بعد التعديل)
// تخزّن بعض القوانين النصّ الأصلي والمعدّل كمادتين بنفس الرقم.
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
    const versions = db
      .prepare(
        `SELECT id AS article_id, article_number, content,
                amend_year, amend_status, amend_note, ordering
         FROM articles
         WHERE law_id = ? AND article_number = ?
         ORDER BY ordering ASC, id ASC`,
      )
      .all(law_id, String(article_number));

    return NextResponse.json({ versions });
  } catch (err) {
    console.error("versions error:", err);
    const message = err instanceof Error ? err.message : "خطأ غير متوقع";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
