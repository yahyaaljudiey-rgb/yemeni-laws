import { NextRequest, NextResponse } from "next/server";
import { getDb, vectorToBlob } from "@/lib/db";
import { extractTextFromFile } from "@/lib/extract";
import { parseArticles } from "@/lib/parser";
import { embedBatch } from "@/lib/embeddings";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof File);

    if (files.length === 0) {
      return NextResponse.json(
        { error: "لم يتم إرفاق أي ملف" },
        { status: 400 },
      );
    }

    const titleInput = (form.get("title") as string | null)?.trim() || "";
    const lawNumber = (form.get("law_number") as string | null)?.trim() || null;
    const year = (form.get("year") as string | null)?.trim() || null;
    const category = (form.get("category") as string | null)?.trim() || null;

    const db = getDb();
    const results: Array<{
      file: string;
      law_id: number;
      title: string;
      articles: number;
    }> = [];

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const text = await extractTextFromFile(file.name, buffer);
      const parsed = parseArticles(text);

      if (parsed.length === 0) {
        results.push({ file: file.name, law_id: -1, title: file.name, articles: 0 });
        continue;
      }

      // عنوان القانون: المُدخَل يدوياً، وإلا اسم الملف بدون الامتداد
      const title =
        titleInput ||
        file.name.replace(/\.(pdf|docx?|txt|md)$/i, "").trim() ||
        "قانون بدون عنوان";

      // التضمين الدلالي لكل المواد دفعة واحدة (قد يستغرق وقتاً عند أول مرة)
      const embeddings = await embedBatch(
        parsed.map((a) => a.content),
        "passage",
      );

      // إدخال كل شيء ضمن معاملة واحدة
      const insertLaw = db.prepare(
        `INSERT INTO laws (title, law_number, year, category, source_file)
         VALUES (?, ?, ?, ?, ?)`,
      );
      const insertArticle = db.prepare(
        `INSERT INTO articles (law_id, article_number, heading, content, ordering, embedding)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      const insertFts = db.prepare(
        `INSERT INTO articles_fts (rowid, content, article_number, law_title)
         VALUES (?, ?, ?, ?)`,
      );

      const tx = db.transaction(() => {
        const lawId = insertLaw.run(
          title,
          lawNumber,
          year,
          category,
          file.name,
        ).lastInsertRowid as number;

        parsed.forEach((art, idx) => {
          const articleId = insertArticle.run(
            lawId,
            art.article_number,
            art.heading,
            art.content,
            idx,
            vectorToBlob(embeddings[idx]),
          ).lastInsertRowid as number;

          insertFts.run(
            articleId,
            art.content,
            art.article_number ?? "",
            title,
          );
        });

        return lawId;
      });

      const lawId = tx();
      results.push({
        file: file.name,
        law_id: lawId,
        title,
        articles: parsed.length,
      });
    }

    return NextResponse.json({ ok: true, results });
  } catch (err) {
    console.error("ingest error:", err);
    const message = err instanceof Error ? err.message : "خطأ غير متوقع";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
