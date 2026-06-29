"use client";

import { useEffect, useState } from "react";

// شاشة ترحيب متحركة: ميزان عدل «يتشكّل» بالرسم ثم يتأرجح ويستقرّ،
// يتلوه ظهور عنوان «القوانين اليمنية» وتوقيع «يحيى الجديعي».
// تُعرَض مرّة واحدة عند فتح التطبيق (لكل جلسة)، ويمكن تخطّيها باللمس.
export default function Splash() {
  const [phase, setPhase] = useState<"hidden" | "show" | "out">("hidden");

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (sessionStorage.getItem("yl_splash_seen")) return;
      sessionStorage.setItem("yl_splash_seen", "1");
    } catch {
      /* تجاهُل أخطاء التخزين */
    }

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    setPhase("show");
    const total = reduce ? 1100 : 3100; // متى يبدأ التلاشي
    const t1 = window.setTimeout(() => setPhase("out"), total);
    const t2 = window.setTimeout(() => setPhase("hidden"), total + 650);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  if (phase === "hidden") return null;

  const dismiss = () => setPhase("out");

  return (
    <div
      className={`yl-splash${phase === "out" ? " yl-splash-out" : ""}`}
      role="presentation"
      onClick={dismiss}
    >
      <div className="yl-splash-glow" aria-hidden />

      <svg
        className="yl-scale"
        viewBox="0 0 220 230"
        fill="none"
        aria-label="ميزان العدل"
      >
        {/* الهيكل الثابت: القاعدة والعمود */}
        <g
          stroke="rgba(255,255,255,0.9)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <ellipse
            className="yl-draw"
            pathLength={100}
            style={{ animationDelay: "0.05s" }}
            cx="110"
            cy="200"
            rx="44"
            ry="8"
          />
          <path
            className="yl-draw"
            pathLength={100}
            style={{ animationDelay: "0.18s" }}
            d="M98 184 L122 184 L118 168 L102 168 Z"
          />
          <line
            className="yl-draw"
            pathLength={100}
            style={{ animationDelay: "0.3s" }}
            x1="110"
            y1="168"
            x2="110"
            y2="60"
          />
          <circle
            className="yl-draw"
            pathLength={100}
            style={{ animationDelay: "0.5s" }}
            cx="110"
            cy="56"
            r="5"
          />
        </g>

        {/* المجموعة المتأرجحة: العارضة والسلاسل والكفّتان */}
        <g className="yl-beam">
          <g
            stroke="#ebc65a"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line
              className="yl-draw"
              pathLength={100}
              style={{ animationDelay: "0.62s" }}
              x1="50"
              y1="58"
              x2="170"
              y2="58"
            />
            {/* سلاسل الكفّة اليسرى */}
            <line className="yl-draw" pathLength={100} style={{ animationDelay: "0.9s" }} x1="50" y1="58" x2="38" y2="106" />
            <line className="yl-draw" pathLength={100} style={{ animationDelay: "0.9s" }} x1="50" y1="58" x2="62" y2="106" />
            {/* سلاسل الكفّة اليمنى */}
            <line className="yl-draw" pathLength={100} style={{ animationDelay: "0.9s" }} x1="170" y1="58" x2="158" y2="106" />
            <line className="yl-draw" pathLength={100} style={{ animationDelay: "0.9s" }} x1="170" y1="58" x2="182" y2="106" />
            {/* الكفّتان */}
            <path className="yl-draw" pathLength={100} style={{ animationDelay: "1.12s" }} d="M28 106 Q50 130 72 106" />
            <path className="yl-draw" pathLength={100} style={{ animationDelay: "1.12s" }} d="M148 106 Q170 130 192 106" />
          </g>
        </g>
      </svg>

      <div className="yl-title">القوانين اليمنية</div>
      <div className="yl-sub">المكتبة القانونية اليمنية الذكية</div>
      <div className="yl-sign">
        <span className="yl-sign-line" aria-hidden />
        <span className="yl-sign-name">يحيى الجديعي</span>
        <span className="yl-sign-line" aria-hidden />
      </div>
    </div>
  );
}
