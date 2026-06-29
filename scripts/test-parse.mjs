import { readFileSync } from "node:fs";
import { parseArticles } from "../lib/parser.ts";

const text = readFileSync(process.argv[2], "utf-8");
const articles = parseArticles(text);

console.log("=== عدد المواد:", articles.length, "===");
const nums = articles.map((a) => a.article_number);
console.log("أول الأرقام:", nums.slice(0, 10).join(", "));
console.log("آخر الأرقام:", nums.slice(-5).join(", "));

for (const a of articles.slice(0, 3)) {
  console.log(`\n--- ${a.heading} ---`);
  console.log(a.content.slice(0, 220).replace(/\n/g, " "));
}
// متوسط طول المادة
const avg = Math.round(
  articles.reduce((s, a) => s + a.content.length, 0) / articles.length,
);
console.log("\nمتوسط طول المادة:", avg, "حرف");
