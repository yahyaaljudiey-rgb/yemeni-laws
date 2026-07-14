"use client";

import { useState } from "react";
import Link from "next/link";

type NavKey = "home" | "search" | "ask" | "browse" | "tools" | "about";

// شريط تنقّل سفلي موحّد لكل الصفحات.
// في الصفحة الرئيسية يُمرَّر onNav لتبديل فوري بلا إعادة تحميل؛ وفي غيرها روابط.
export default function AppBottomNav({
  active,
  onNav,
  onAi,
}: {
  active: NavKey;
  onNav?: (screen: "home" | "search" | "browse" | "ask") => void;
  onAi?: () => void;
}) {
  const [more, setMore] = useState(false);

  return (
    <>
      <nav className="yl-bottomnav">
        {(
          [
            { k: "home", icon: "🏠", label: "الرئيسية", screen: "home" as const },
            { k: "search", icon: "🔎", label: "البحث", screen: "search" as const },
            { k: "ask", icon: "💬", label: "المستشار", screen: "ask" as const },
            { k: "browse", icon: "📚", label: "المكتبة", screen: "browse" as const },
          ]
        ).map((it) =>
          onNav ? (
            <button
              key={it.k}
              className={`yl-navbtn${active === it.k ? " active" : ""}${it.k === "ask" ? " yl-navbtn-ai" : ""}`}
              onClick={() => onNav(it.screen)}
            >
              <span className="yl-navicon">{it.icon}</span>
              {it.label}
            </button>
          ) : (
            <Link
              key={it.k}
              href={`/?screen=${it.screen}`}
              className={`yl-navbtn${active === it.k ? " active" : ""}${it.k === "ask" ? " yl-navbtn-ai" : ""}`}
            >
              <span className="yl-navicon">{it.icon}</span>
              {it.label}
            </Link>
          ),
        )}
        <button
          className={`yl-navbtn${active === "about" || more ? " active" : ""}`}
          onClick={() => setMore(true)}
        >
          <span className="yl-navicon">☰</span>
          المزيد
        </button>
      </nav>

      {more && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center sm:justify-center"
          onClick={() => setMore(false)}
        >
          <div
            className="w-full sm:max-w-sm bg-surface rounded-t-2xl sm:rounded-2xl p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-primary">المزيد</h3>
              <button
                onClick={() => setMore(false)}
                className="text-muted text-xl leading-none px-2"
              >
                ×
              </button>
            </div>
            <div className="space-y-1.5 text-sm">
              {onAi && (
                <button
                  onClick={() => {
                    setMore(false);
                    onAi();
                  }}
                  className="w-full text-right px-3 py-2.5 rounded-lg hover:bg-primary/5 flex items-center gap-2"
                >
                  ⚙️ <span>إعدادات الذكاء (المفتاح والخادم)</span>
                </button>
              )}
              <Link
                href="/tools"
                className="w-full text-right px-3 py-2.5 rounded-lg hover:bg-primary/5 flex items-center gap-2"
              >
                🧮 <span>الحاسبات القانونية</span>
              </Link>
              <Link
                href="/about"
                className="w-full text-right px-3 py-2.5 rounded-lg hover:bg-primary/5 flex items-center gap-2"
              >
                ℹ️ <span>عن التطبيق</span>
              </Link>
              <a
                href="mailto:yahyaaljudiey@gmail.com"
                className="w-full text-right px-3 py-2.5 rounded-lg hover:bg-primary/5 flex items-center gap-2"
              >
                ✉️ <span>تواصل مع المطوّر</span>
              </a>
            </div>
            <p className="text-center text-[11px] text-muted mt-3">
              <span className="yl-head-sign">يحيى الجديعي</span> — القوانين
              اليمنية
            </p>
          </div>
        </div>
      )}
    </>
  );
}
