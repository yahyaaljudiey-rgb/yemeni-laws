"use client";

import { useEffect, useState } from "react";
import { BASE_PATH, asset } from "@/lib/base-path";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// يسجّل الـService Worker ويعرض زر/تلميح تثبيت التطبيق على الجوال
export default function PWA() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register(`${BASE_PATH}/sw.js`, { scope: `${BASE_PATH}/` })
        .catch(() => {});
    }
    setStandalone(window.matchMedia("(display-mode: standalone)").matches);
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent));

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (standalone || dismissed) return null;
  // لا نعرض شيئاً إن لم يتوفّر زر تثبيت (أندرويد) ولا كان iOS
  if (!deferred && !isIOS) return null;

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setDismissed(true);
  }

  return (
    <div className="fixed bottom-3 inset-x-3 z-50 max-w-md mx-auto">
      <div className="bg-surface border border-primary/40 rounded-2xl shadow-lg p-3 flex items-center gap-3">
        <img src={asset("/icon-192x192.png")} alt="" className="w-10 h-10 rounded-xl" />
        <div className="flex-1 text-sm">
          <p className="font-bold text-primary">ثبّت تطبيق Yemeni Laws</p>
          {isIOS && !deferred ? (
            <p className="text-xs text-muted mt-0.5">
              اضغط زر المشاركة ⎋ ثم «أضِف إلى الشاشة الرئيسية» ➕
            </p>
          ) : (
            <p className="text-xs text-muted mt-0.5">
              للوصول السريع كتطبيق على جوالك
            </p>
          )}
        </div>
        {deferred && (
          <button
            onClick={install}
            className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-strong"
          >
            تثبيت
          </button>
        )}
        <button
          onClick={() => setDismissed(true)}
          aria-label="إغلاق"
          className="text-muted hover:text-foreground px-2 text-lg leading-none"
        >
          ×
        </button>
      </div>
    </div>
  );
}
