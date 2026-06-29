// مسار القاعدة (basePath) للنشر تحت مسار فرعي مثل GitHub Pages: user.github.io/yemeni-laws/
// يُحقَن وقت البناء عبر NEXT_PUBLIC_BASE_PATH (فارغ = الجذر، كما في Cloudflare Pages).
// يُستخدم لتكييف المسارات المطلقة التي لا يُعالجها Next تلقائياً (fetch / <img> / تسجيل SW).
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

// يُلحق basePath أمام مسار أصل ثابت يبدأ بـ "/"
export function asset(p: string): string {
  return `${BASE_PATH}${p}`;
}
