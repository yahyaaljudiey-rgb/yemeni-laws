import { NextRequest, NextResponse } from "next/server";
import { getDb, blobToVector } from "@/lib/db";
import { embed, cosineSim } from "@/lib/embeddings";

export const runtime = "nodejs";
export const maxDuration = 120;

export interface SearchHit {
  article_id: number;
  law_id: number;
  law_title: string;
  law_number: string | null;
  year: string | null;
  category: string | null;
  article_number: string | null;
  heading: string | null;
  content: string;
  score: number;
  matched_keyword: boolean;
  amend_year: number | null;
  amend_status: string | null;
  amend_note: string | null;
}

// تجهيز استعلام FTS آمن: نأخذ الكلمات ونربطها بـ OR لزيادة الاستدعاء
function buildFtsQuery(q: string): string {
  const tokens = q
    .replace(/["'()*]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1);
  if (tokens.length === 0) return "";
  return tokens.map((t) => `"${t}"`).join(" OR ");
}

export async function POST(req: NextRequest) {
  try {
    const { query, limit = 20 } = (await req.json()) as {
      query?: string;
      limit?: number;
    };

    if (!query || !query.trim()) {
      return NextResponse.json({ error: "الرجاء إدخال نص للبحث" }, { status: 400 });
    }

    const db = getDb();

    // 1) البحث الدلالي: نحسب تشابه السؤال مع كل المواد
    const queryVec = await embed(query, "query");
    const rows = db
      .prepare(`SELECT id, embedding FROM articles WHERE embedding IS NOT NULL`)
      .all() as { id: number; embedding: Buffer }[];

    const scores = new Map<number, number>();
    for (const row of rows) {
      const sim = cosineSim(queryVec, blobToVector(row.embedding));
      scores.set(row.id, sim);
    }

    // 2) البحث بالكلمات المفتاحية (FTS) لإضافة دفعة للمطابقات الحرفية
    const keywordHits = new Set<number>();
    const ftsQuery = buildFtsQuery(query);
    if (ftsQuery) {
      try {
        const ftsRows = db
          .prepare(
            `SELECT rowid FROM articles_fts WHERE articles_fts MATCH ?
             ORDER BY bm25(articles_fts) LIMIT 80`,
          )
          .all(ftsQuery) as { rowid: number }[];
        for (const r of ftsRows) {
          keywordHits.add(r.rowid);
          // دفعة للنتيجة الدلالية عند وجود تطابق حرفي
          scores.set(r.rowid, (scores.get(r.rowid) ?? 0) + 0.12);
        }
      } catch {
        // نتجاهل أخطاء صياغة FTS بصمت ونكتفي بالبحث الدلالي
      }
    }

    // 3) ترتيب أعلى النتائج
    const top = [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, Math.min(limit, 50));

    if (top.length === 0) {
      return NextResponse.json({ hits: [] });
    }

    const ids = top.map(([id]) => id);
    const placeholders = ids.map(() => "?").join(",");
    const details = db
      .prepare(
        `SELECT a.id AS article_id, a.law_id, a.article_number, a.heading, a.content,
                a.amend_year, a.amend_status, a.amend_note,
                l.title AS law_title, l.law_number, l.year, l.category
         FROM articles a JOIN laws l ON l.id = a.law_id
         WHERE a.id IN (${placeholders})`,
      )
      .all(...ids) as Omit<SearchHit, "score" | "matched_keyword">[];

    const byId = new Map(details.map((d) => [d.article_id, d]));
    const hits: SearchHit[] = top
      .map(([id, score]) => {
        const d = byId.get(id);
        if (!d) return null;
        return { ...d, score, matched_keyword: keywordHits.has(id) };
      })
      .filter((h): h is SearchHit => h !== null);

    return NextResponse.json({ hits });
  } catch (err) {
    console.error("search error:", err);
    const message = err instanceof Error ? err.message : "خطأ غير متوقع";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
