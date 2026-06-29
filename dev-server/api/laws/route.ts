import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

// قائمة كل الوثائق (قوانين/لوائح/أحكام) للتصفّح في المكتبة
export async function GET() {
  try {
    const db = getDb();
    const laws = db
      .prepare(
        `SELECT l.id, l.title, l.law_number, l.year, l.category,
                COUNT(a.id) AS article_count
         FROM laws l LEFT JOIN articles a ON a.law_id = l.id
         GROUP BY l.id
         ORDER BY l.id`,
      )
      .all();
    return NextResponse.json({ laws });
  } catch (err) {
    console.error("laws list error:", err);
    const message = err instanceof Error ? err.message : "خطأ غير متوقع";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
