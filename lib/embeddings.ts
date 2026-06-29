import path from "node:path";
import {
  pipeline,
  env,
  type FeatureExtractionPipeline,
} from "@huggingface/transformers";

// نموذج تضمين متعدد اللغات يدعم العربية جيداً (384 بُعداً)
// يُنزَّل مرة واحدة عند أول استخدام ثم يُخزَّن محلياً في data/models
const MODEL_ID = "Xenova/multilingual-e5-small";

env.cacheDir = path.join(process.cwd(), "data", "models");
env.allowLocalModels = true;

let _extractor: Promise<FeatureExtractionPipeline> | null = null;

function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!_extractor) {
    _extractor = pipeline("feature-extraction", MODEL_ID);
  }
  return _extractor;
}

// نموذج e5 يتطلب بادئات: "query:" لسؤال البحث و"passage:" للنصوص المخزَّنة
function withPrefix(text: string, kind: "query" | "passage"): string {
  return `${kind}: ${text.replace(/\s+/g, " ").trim()}`;
}

export async function embed(
  text: string,
  kind: "query" | "passage" = "passage",
): Promise<Float32Array> {
  const extractor = await getExtractor();
  const output = await extractor(withPrefix(text, kind), {
    pooling: "mean",
    normalize: true,
  });
  return Float32Array.from(output.data as Float32Array);
}

// تضمين دفعة من النصوص (أسرع من واحد تلو الآخر)
export async function embedBatch(
  texts: string[],
  kind: "query" | "passage" = "passage",
): Promise<Float32Array[]> {
  const extractor = await getExtractor();
  const results: Float32Array[] = [];
  // نعالج على دفعات صغيرة لتفادي استهلاك الذاكرة
  const BATCH = 16;
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH).map((t) => withPrefix(t, kind));
    const output = await extractor(slice, { pooling: "mean", normalize: true });
    const dim = output.dims[output.dims.length - 1];
    const data = output.data as Float32Array;
    for (let j = 0; j < slice.length; j++) {
      results.push(Float32Array.from(data.subarray(j * dim, (j + 1) * dim)));
    }
  }
  return results;
}

// تشابه جيب التمام بين متجهين مُطبَّعين (القيمة الأعلى = أقرب)
export function cosineSim(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot;
}
