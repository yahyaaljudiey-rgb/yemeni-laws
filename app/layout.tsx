import type { Metadata, Viewport } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";
import PWA from "./pwa";
import { asset } from "@/lib/base-path";

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Yemeni Laws — القوانين اليمنية",
  description:
    "Yemeni Laws: مكتبة ذكية للقوانين اليمنية مع بحث دلالي متقدم وإجابات مدعومة بالذكاء الاصطناعي والاستشهاد بالمواد.",
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
  themeColor: "#0e6b5e",
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
    <html lang="ar" dir="rtl" className={`${cairo.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <PWA />
      </body>
    </html>
  );
}
