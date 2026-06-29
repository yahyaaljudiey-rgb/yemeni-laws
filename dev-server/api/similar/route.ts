import { NextRequest, NextResponse } from "next/server";
import { getDb, blobToVector } from "@/lib/db";
import { cosineSim } from "@/lib/embeddings";

export const runtime = "nodejs";
export const maxDuration = 120;

// المواد المشابهة دلالياً لمادة معيّنة (اعتماداً على متجه التضمين المخزَّن)
export async function POST(req: NextRequest) {
  try {
    const { article_id, limit = 5 } = (await req.json()) as {
      article_id?: number;
      limit?: number;
    };
    if (!article_id) {
      return NextResponse.json({ error: "معرّف المادة مطلوب" }, { status: 400 });
    }

    const db = getDb();
    const base = db
      .prepare(`SELECT embedding FROM articles WHERE id = ?`)
      .get(article_id) as { embedding: Buffer | null } | undefined;

    if (!base?.embedding) {
      return NextResponse.json({ similar: [] });
    }
    const baseVec = blobToVector(base.embedding);

    const rows = db
      .prepare(
        `SELECT id, embedding FROM articles
         WHERE embedding IS NOT NULL AND id != ?`,
      )
      .all(article_id) as { id: number; embedding: Buffer }[];

    const scored = rows
      .map((r) => ({ id: r.id, sim: cosineSim(baseVec, blobToVector(r.embedding)) }))
      .sort((a, b) => b.sim - a.sim)
      .slice(0, Math.min(limit, 10));

    if (scored.length === 0) return NextResponse.json({ similar: [] });

    const ids = scored.map((s) => s.id);
    const placeholders = ids.map(() => "?").join(",");
    const details = db
      .prepare(
        `SELECT a.id AS article_id, a.law_id, a.article_number, a.content,
                a.amend_status, a.amend_year,
                l.title AS law_title, l.law_number, l.year
         FROM articles a JOIN laws l ON l.id = a.law_id
         WHERE a.id IN (${placeholders})`,
      )
      .all(...ids) as Record<string, unknown>[];

    const byId = new Map(details.map((d) => [d.article_id as number, d]));
    const similar = scored
      .map((s) => {
        const d = byId.get(s.id);
        return d ? { ...d, score: s.sim } : null;
      })
      .filter(Boolean);

    return NextResponse.json({ similar });
  } catch (err) {
    console.error("similar error:", err);
    const message = err instanceof Error ? err.message : "خطأ غير متوقع";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
