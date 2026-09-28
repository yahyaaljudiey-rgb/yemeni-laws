import Link from "next/link";

// تذييل موحّد مختصر: توقيع المطوّر ووصف موجز — يُستخدم في كل الصفحات
export default function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface/60">
      <div className="max-w-4xl mx-auto px-4 py-5 text-center">
        <div className="yl-footer-sign">
          <span className="yl-footer-line" aria-hidden />
          <span className="yl-footer-name">يحيى الجديعي</span>
          <span className="yl-footer-line" aria-hidden />
        </div>
        <p className="text-xs text-muted mt-1.5">
          مكتبة قانونية ذكية للقوانين اليمنية
        </p>
        <div className="mt-2 flex items-center justify-center gap-3 text-[11px] text-muted">
          <Link href="/privacy.html" className="hover:text-accent">الخصوصية</Link>
          <span aria-hidden>·</span>
          <Link href="/terms.html" className="hover:text-accent">شروط الاستخدام</Link>
        </div>
      </div>
    </footer>
  );
}
