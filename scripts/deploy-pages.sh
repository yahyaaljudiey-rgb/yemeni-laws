#!/usr/bin/env bash
# نشر الموقع الثابت إلى فرع gh-pages على GitHub.
# يبني التصدير بمسار القاعدة /yemeni-laws ثم يدفع out/ كاملاً (بما فيه data/)
# إلى فرع gh-pages عبر git مباشرةً — لا يعتمد حزمة gh-pages (التي تستبعد data/).
#
# الاستخدام:  bash scripts/deploy-pages.sh
set -euo pipefail

REPO="yahyaaljudiey-rgb/yemeni-laws"
BASE="/yemeni-laws"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "» بناء التصدير الثابت (NEXT_PUBLIC_BASE_PATH=$BASE) ..."
rm -rf .next out
NEXT_PUBLIC_BASE_PATH="$BASE" npm run build

touch out/.nojekyll   # ضروري ليخدم GitHub مجلّد _next/

# النموذج الدلالي وملفات WASM تُغلَّف في APK فقط (تتجاوز حدّ GitHub 100MB للملف).
# السحاب يرتدّ تلقائياً للبحث اللفظي إن غابا.
rm -rf out/models out/ort

echo "» دفع out/ إلى فرع gh-pages ..."
TOKEN="$(gh auth token)"
cd out
rm -rf .git
git init -q
git checkout -q -b gh-pages
git config user.email "aljdyyy@gmail.com"
git config user.name "yahyaaljudiey-rgb"
git add -A
git commit -q -m "تحديث النشر $(date +%Y-%m-%d)"
git push -f "https://x-access-token:${TOKEN}@github.com/${REPO}.git" gh-pages
rm -rf .git
cd "$ROOT"

echo "✅ تم. الموقع: https://${REPO%%/*}.github.io/${REPO#*/}/"
