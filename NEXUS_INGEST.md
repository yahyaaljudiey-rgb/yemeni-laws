# حزمة إدخال محتوى التطبيق إلى نواة NEXUS

تُدخِل **كل** محتوى «تطبيق القوانين اليمنية» في مخزن معرفة NEXUS (Phase 13+)،
ليجيب المساعد الذكي عن القوانين والأحكام والحاسبات والتطبيق نفسه بالتطبيع
العربي الجديد. أُعدّت من طرف التطبيق (التكامل)؛ **نشر النواة وتشغيلها من نطاق Fable**.

## المجموعة (29,316 وثيقة)
| النوع | العدد | المصدر |
|---|---|---|
| `law_article` — مواد القوانين بنصّها | 26,941 | `public/data/articles.json` |
| `law_overview` — بطاقة كل قانون | 378 | `public/data/laws.json` |
| `judgment` — قواعد المحكمة العليا | 1,990 | `public/data/judgments.json` |
| `calculator` — الحاسبات بأساسها القانوني | 4 | `lib/calculators/*` (منسّقة يدوياً) |
| `app_info` — عن التطبيق/الهيكل/المنهج | 3 | `app/about`, `lib/amendments` |

## الملفّات
- `scripts/nexus-ingest.mjs` — المُشغّل (يبني الوثائق ويُخرجها أو يُدخلها).
- `scripts/nexus-app-docs.mjs` — وثائق المعرفة المنسّقة (الحاسبات + التطبيق).

## التشغيل
```bash
# 1) معاينة بلا خادم (للتفتيش/التسليم): يُخرج documents.ndjson + summary + samples
node scripts/nexus-ingest.mjs --out out/nexus

# 2) الإدخال الفعلي إلى خادم NEXUS جاهز:
node scripts/nexus-ingest.mjs --url https://HOST --concurrency 6
#   خيارات: --token T | --only articles,judgments,app | --limit N | --dry
```
كل وثيقة تُرسَل عبر **`POST /documents`** بجسم `{ title, content, metadata }`
(عقد `IngestRequest`). الإدخال **قابل للاستئناف**: يحفظ التقدّم في
`out/nexus/.progress.json` بمفتاح `ext_id`، فلا يُعيد ما نجح؛ والأخطاء تُسجَّل
في `*.errors.json`.

## المتطلّبات قبل الإدخال (على Fable)
1. **نشر Phase 15** (الإصدار `0.1.0`) — الخادم الحالي على `sslip.io` هو `0.12.0`
   و`readyz` يُظهر `postgres: fail`، فلا يقبل الإدخال ولا يملك التطبيع الجديد.
2. `readyz` = `ready` (Postgres + نموذج التضمين `bge-m3` عبر Ollama متاحان).
3. تأكيد أنّ `POST /documents` غير محميّ أو تزويدنا برمز (`--token`).

## مخطّط الميتاداتا (للاسترجاع والعزو)
- عام: `type`, `source`, `source_tier` (primary/judgment/reference), `category`, `ext_id`.
- `law_article`: `law_id`, `law_title`, `law_number`, `year`, `article_number`, `amend_status`, `amend_year`.
- `judgment`: `collection`, `issue_num`, `rule_number`, `case_number`, `page`, `has_full_text`.
- `calculator`/`app_info`: `calc_key` (diya/court-fees/deadlines/inheritance).

## ملاحظات
- النصوص المعروضة والعزو لا تُطبَّع (التطبيع يمسّ الفهرسة والمطابقة فقط — Phase 13).
- التعديلات غير المعترف بها (بعد 2014) مُعلَّمة في `amend_status` ومنبَّهٌ عليها داخل النص.
- إعادة التشغيل آمنة (idempotent) عبر `ext_id`؛ ولو دعمت النواة الحذف بالـ`ext_id` مستقبلاً أمكن التحديث النظيف.
