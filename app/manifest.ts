import type { MetadataRoute } from "next";
import { asset } from "@/lib/base-path";

// توليد البيان كملفّ ثابت عند التصدير (output: export)
export const dynamic = "force-static";

// بيان تطبيق الويب — يجعل Yemeni Laws قابلاً للتثبيت على الجوال كتطبيق
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Yemeni Laws — القوانين اليمنية",
    short_name: "Yemeni Laws",
    description:
      "مكتبة ذكية للقوانين اليمنية: بحث سريع وتصفّح مرتّب وإجابات بالذكاء الاصطناعي مع تمييز التعديلات.",
    start_url: asset("/"),
    scope: asset("/"),
    display: "standalone",
    orientation: "portrait",
    dir: "rtl",
    lang: "ar",
    background_color: "#0e6b5e",
    theme_color: "#0e6b5e",
    categories: ["education", "books", "productivity"],
    icons: [
      { src: asset("/icon-192x192.png"), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: asset("/icon-512x512.png"), sizes: "512x512", type: "image/png", purpose: "any" },
      { src: asset("/icon-maskable-512.png"), sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
