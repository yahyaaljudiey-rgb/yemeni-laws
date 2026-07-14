import Link from "next/link";
import SiteFooter from "../site-footer";
import AppBottomNav from "../app-bottom-nav";

export const metadata = {
  title: "عن التطبيق — القوانين اليمنية",
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-surface border border-border rounded-2xl p-5 shadow-sm">
      <h2 className="text-base font-bold text-primary mb-2">{title}</h2>
      <div className="text-sm leading-8 text-foreground/90 space-y-2">
        {children}
      </div>
    </section>
  );
}

export default function AboutPage() {
  return (
    <div className="flex flex-col min-h-full pb-16">
      <header className="yl-appbar sticky top-0 z-30 shadow-md">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="leading-tight">
            <span className="yl-appbar-title block font-bold text-lg">
              عن التطبيق
            </span>
            <span className="yl-appbar-sign block text-[11px]">
              القوانين اليمنية
            </span>
          </div>
          <Link href="/" className="yl-appbar-btn text-sm whitespace-nowrap">
            ← الرئيسية
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6 pb-24 space-y-4">
        <Section title="الفكرة">
          <p>
            تطبيقٌ يجمع القوانين اليمنية واللوائح والقواعد القضائية وتعليمات
            النيابة العامة في مكانٍ واحد، ويتيح <strong>بحثاً ذكياً</strong>{" "}
            (دلالياً وبالكلمات) و<strong>تصفّحاً</strong> للنصوص كالكتاب، إضافةً
            إلى <strong>حاسبات قانونية</strong> عملية. يعمل دون إنترنت بعد
            تحميله أول مرّة.
          </p>
        </Section>

        <Section title="المميّزات">
          <ul className="list-disc ps-5 space-y-1">
            <li>أربع نوافذ: القوانين، اللوائح، القواعد القضائية، تعليمات النيابة.</li>
            <li>
              بحث دلالي في المتصفّح دون خادم، ونسخ المواد مع العزو القانوني.
            </li>
            <li>
              عرض النصوص بصيغتها <strong>المعتمدة قبل 2014</strong>، مع زرٍّ
              يُظهر التعديلات الصادرة بعد 2014 (غير المعترف بها) لمن أراد.
            </li>
            <li>
              حاسبات: الرسوم القضائية، المواعيد، المواريث (الفرائض)، والديات
              والأروش.
            </li>
            <li>
              إجابات بالذكاء الاصطناعي (اختيارية) بمفتاح المستخدم الخاص — دون أي
              تكلفة على التطبيق.
            </li>
          </ul>
        </Section>

        <Section title="ما الجديد">
          <ul className="list-disc ps-5 space-y-1">
            <li>
              <strong>نافذة «الأحكام القضائية»</strong> المستقلّة: سوابق المحكمة
              العليا بنصّها الكامل (1990 قاعدة)، تصفّح حسب الفئة وحسب الموضوع
              (الدوائر)، وبحث في موضوع الحكم ونصّه.
            </li>
            <li>
              <strong>مساعد ذكي محسّن:</strong> بثّ حيّ للإجابة، ومصادر قابلة
              للنقر، واستناد إلى نصوص القوانين والأحكام.
            </li>
            <li>
              <strong>حاسبة المواعيد:</strong> مراعاة العطل الرسمية والعطلة
              القضائية (رمضان) مع امتداد اليوم الأخير، وتمييز القضايا المستعجلة.
            </li>
            <li>
              <strong>حاسبة الرسوم القضائية:</strong> اعتماد صيغة قرار عدن رقم
              (41) لسنة 2025م، مع الرسوم الثابتة وأسس تقدير قيمة الدعوى.
            </li>
            <li>
              <strong>حاسبة الديات والأروش:</strong> وفق جدول قرار رقم (51) لسنة
              2024م.
            </li>
            <li>
              تمييز التعديلات الصادرة بعد 2014 (غير المعترف بها) بتنبيهٍ واضح.
            </li>
          </ul>
        </Section>

        <Section title="المصادر والمنهج">
          <p>
            جُمعت النصوص من مصادر القوانين اليمنية، واعتُمدت في الرسوم القضائية
            صيغة قرار رئيس مجلس القضاء الأعلى رقم (41) لسنة 2025م، وفي الديات
            جدول قرار رقم (51) لسنة 2024م. الأصل المعروض هو النسخة المعترف بها،
            والتعديلات الصادرة في صنعاء بعد 2014 تُعرض للاطّلاع فقط مع بيان أنها
            غير معترف بها.
          </p>
        </Section>

        <Section title="إخلاء مسؤولية">
          <p>
            جميع المخرجات (بما فيها نتائج الحاسبات والبحث والإجابات الذكية)
            <strong> استرشادية</strong>، ولا تُغني عن الرجوع إلى النصّ الرسمي
            للقانون وإلى المختصّ القانوني. لا يتحمّل التطبيق أو معدّه مسؤولية أي
            استخدام يترتّب على هذه المخرجات.
          </p>
        </Section>

        <Section title="الإعداد والمراجعة">
          <div className="yl-footer-sign justify-start">
            <span className="yl-footer-name">يحيى الجديعي</span>
            <span className="yl-footer-line" aria-hidden />
          </div>
          <p className="mt-1 text-muted text-[13px]">الإعداد والتطوير</p>

          <div className="yl-reviewers mt-4">
            <span className="yl-reviewers-head">
              <span className="yl-reviewers-icon" aria-hidden>
                ⚖️
              </span>
              مراجعة قضائية
            </span>
            <p className="yl-reviewers-note">
              تُراجَع مواد التطبيق ومدخلاته (بما فيها أسس الحاسبات) لضمان دقّتها من:
            </p>
            <div className="yl-reviewers-names">
              <span className="yl-judge">القاضي علاء الفخري</span>
              <span className="yl-judge">القاضي يحيى مخارش</span>
            </div>
          </div>
          <p className="mt-3">
            للتواصل والملاحظات:{" "}
            <a
              href="mailto:yahyaaljudiey@gmail.com"
              className="text-primary hover:underline"
            >
              yahyaaljudiey@gmail.com
            </a>
          </p>
        </Section>
      </main>

      <SiteFooter />
      <AppBottomNav active="about" />
    </div>
  );
}
