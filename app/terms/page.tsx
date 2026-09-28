import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "شروط الاستخدام — القوانين اليمنية",
  description: "شروط استخدام مكتبة القوانين اليمنية وإضافة ChatGPT.",
};

export default function TermsPage() {
  return (
    <main dir="rtl" className="min-h-screen bg-background text-foreground px-4 py-10">
      <article className="max-w-3xl mx-auto bg-surface border border-border rounded-2xl p-6 sm:p-9 leading-8">
        <h1 className="text-2xl font-bold text-primary mb-2">شروط الاستخدام</h1>
        <p className="text-sm text-muted mb-7">آخر تحديث: 28 سبتمبر 2026</p>

        <div className="space-y-5">
          <section>
            <h2 className="font-bold text-lg mb-1">الغرض</h2>
            <p>المكتبة وإضافة ChatGPT أدوات بحث واطلاع عام في التشريعات اليمنية، وليستا بديلاً عن المحامي أو الجهة الرسمية أو النسخة المنشورة في الجريدة الرسمية.</p>
          </section>
          <section>
            <h2 className="font-bold text-lg mb-1">دقة المعلومات</h2>
            <p>نبذل جهداً للتحقق من النصوص وإظهار مصادرها وحالة التعديلات، لكن قد توجد أخطاء نسخ أو وثائق ناقصة أو تحديثات لم تدرج بعد. يجب مراجعة المصدر الرسمي قبل اتخاذ أي إجراء قانوني.</p>
          </section>
          <section>
            <h2 className="font-bold text-lg mb-1">إجابات الذكاء الاصطناعي</h2>
            <p>يصوغ ChatGPT الإجابة اعتماداً على نتائج البحث التي توفرها الإضافة، وقد يخطئ في الفهم أو الاستنتاج. روابط المواد المرفقة هي أساس التحقق، ولا تمثل الإجابة استشارة قانونية ملزمة.</p>
          </section>
          <section>
            <h2 className="font-bold text-lg mb-1">الاستخدام المقبول</h2>
            <p>يجوز استخدام الخدمة للبحث والتعليم والعمل القانوني المشروع. يحظر تعطيل الخدمة أو إرسال طلبات آلية مفرطة أو محاولة تجاوز حدود الأمان أو نسبة محتوى مضلل إلى المشروع.</p>
          </section>
          <section>
            <h2 className="font-bold text-lg mb-1">التوفر والتعديلات</h2>
            <p>تقدم الخدمة كما هي، وقد تتغير المصادر والخصائص أو تتوقف مؤقتاً لأعمال الصيانة. قد تُحدّث هذه الشروط عند تطوير الخدمة.</p>
          </section>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/" className="text-accent underline">العودة إلى المكتبة</Link>
          <Link href="/privacy.html" className="text-accent underline">سياسة الخصوصية</Link>
        </div>
      </article>
    </main>
  );
}
