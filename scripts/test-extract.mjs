import { readFileSync } from "node:fs";
import { extractTextFromFile } from "../lib/extract.ts";
import { parseArticles } from "../lib/parser.ts";

const path = process.argv[2];
const buf = readFileSync(path);
const text = await extractTextFromFile(path, buf);

console.log("=== طول النص المُستخرَج:", text.length, "حرف ===");
console.log("=== عيّنة (أول 600 حرف) ===");
console.log(text.slice(0, 600));

const articles = parseArticles(text);
console.log("\n=== عدد المواد:", articles.length, "===");
for (const a of articles.slice(0, 3)) {
  console.log(`\n--- ${a.heading} (رقم: ${a.article_number}) ---`);
  console.log(a.content.slice(0, 300));
}
