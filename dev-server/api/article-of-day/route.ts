import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export interface DailyArticle {
  article_id: number;
  law_id: number;
  law_title: string;
  law_number: string | null;
  year: string | null;
  article_number: string | null;
  content: string;
  amend_status: string | null;
  amend_year: number | null;
}

// مادة اليوم: اختيار ثابت يعتمد على تاريخ اليوم (يتغيّر يومياً ويثبت خلال اليوم)
export async function GET() {
  try {
    const db = getDb();

    // نختار مواد ذات طول معقول (نتجنّب الديباجة/الخاتمة والمواد القصيرة جداً)
    const ids = db
      .prepare(
        `SELECT a.id FROM articles a
         WHERE a.article_number IS NOT NULL
           AND length(a.content) BETWEEN 120 AND 900
         ORDER BY a.id`,
      )
      .all() as { id: number }[];

    if (ids.length === 0) {
      return NextResponse.json({ article: null });
    }

    // بذرة يومية ثابتة
    const today = new Date();
    const seed =
      today.getUTCFullYear() * 1000 +
      (today.getUTCMonth() + 1) * 50 +
      today.getUTCDate();
    const idx = (seed * 2654435761) % ids.length;
    const chosenId = ids[Math.abs(idx)].id;

    const article = db
      .prepare(
        `SELECT a.id AS article_id, a.law_id, a.article_number, a.content,
                a.amend_status, a.amend_year,
                l.title AS law_title, l.law_number, l.year
         FROM articles a JOIN laws l ON l.id = a.law_id
         WHERE a.id = ?`,
      )
      .get(chosenId) as DailyArticle | undefined;

    return NextResponse.json({ article: article ?? null });
  } catch (err) {
    console.error("article-of-day error:", err);
    return NextResponse.json({ article: null });
  }
}
