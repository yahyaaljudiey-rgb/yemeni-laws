import type { NextConfig } from "next";

// تطبيق ثابت 100% (offline-first، بلا خادم): يُصدَّر إلى مجلّد out/
// ويُرفع لأي استضافة ملفّات ثابتة (Cloudflare Pages / Netlify / Vercel).
// كل المنطق يجري في المتصفّح من حزمة public/data، والذكاء عبر مفتاح المستخدم.
// مسار القاعدة للنشر تحت مسار فرعي (GitHub Pages: /<repo>). فارغ = الجذر (Cloudflare).
// يُحقَن وقت البناء عبر NEXT_PUBLIC_BASE_PATH ويُدمَج في حزم العميل.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  output: "export",

  // النشر تحت مسار فرعي عند الحاجة (يُطبَّق تلقائياً على next/link وأصول Next)
  ...(basePath ? { basePath } : {}),

  // تصدير الصور دون تحسين خادمي (لا يوجد خادم في الإنتاج)
  images: { unoptimized: true },

  // السماح بموارد التطوير عند الفتح من هذه العناوين
  allowedDevOrigins: ["127.0.0.1", "localhost", "192.168.0.96"],
};

export default nextConfig;
