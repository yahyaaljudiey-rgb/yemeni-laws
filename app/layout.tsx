import type { Metadata, Viewport } from "next";
import { Amiri, Cairo } from "next/font/google";
import "./globals.css";
import PWA from "./pwa";
import Splash from "./splash";
import { asset } from "@/lib/base-path";

// أميري: خط نسخيّ كلاسيكي واضح يُظهر التشكيل بدقّة — للنصوص القانونية.
const amiri = Amiri({
  variable: "--font-amiri",
  weight: ["400", "700"],
  subsets: ["arabic", "latin"],
  display: "swap",
});

// كايرو: خط احتياطي للأرقام والعناصر الصغيرة في الواجهة.
const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Yemeni Laws — القوانين اليمنية",
  description:
    "Yemeni Laws: مكتبة ذكية للقوانين اليمنية مع بحث سريع وتصفّح مرتّب وإجابات مدعومة بالذكاء الاصطناعي والاستشهاد بالمواد.",
  // Next يُلحق basePath تلقائياً بـ manifest، لكنه لا يفعل ذلك مع icons فنُلحقه يدوياً
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Yemeni Laws",
  },
  icons: {
    icon: asset("/icon-192x192.png"),
    apple: asset("/apple-icon.png"),
  },
};

export const viewport: Viewport = {
  themeColor: "#12294d",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${amiri.variable} ${cairo.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Splash />
        <PWA />
      </body>
    </html>
  );
}
