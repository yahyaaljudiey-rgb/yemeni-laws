import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "سياسة الخصوصية — القوانين اليمنية",
  description: "سياسة خصوصية مكتبة القوانين اليمنية وإضافة ChatGPT.",
};

export default function PrivacyPage() {
  return (
    <main dir="rtl" className="min-h-screen bg-background text-foreground px-4 py-10">
      <article className="max-w-3xl mx-auto bg-surface border border-border rounded-2xl p-6 sm:p-9 leading-8">
        <h1 className="text-2xl font-bold text-primary mb-2">سياسة الخصوصية</h1>
        <p className="text-sm text-muted mb-7">آخر تحديث: 28 سبتمبر 2026</p>

        <div className="space-y-5">
          <section>
            <h2 className="font-bold text-lg mb-1">نطاق الخدمة</h2>
            <p>تتيح مكتبة القوانين اليمنية البحث والقراءة في نصوص قانونية عامة، كما توفر إضافة قراءة فقط تربط ChatGPT وCodex بالمكتبة عبر بروتوكول MCP.</p>
          </section>
          <section>
            <h2 className="font-bold text-lg mb-1">البيانات التي نعالجها</h2>
            <p>لا تتطلب إضافة القوانين اليمنية إنشاء حساب ولا تطلب الاسم أو البريد أو رقم الهاتف. يستقبل خادم البحث عبارة البحث ومعرّف المادة اللازمة لإرجاع النتائج. قد يحتفظ مزود الاستضافة بسجلات تشغيل تقنية مؤقتة مثل عنوان IP ووقت الطلب لأغراض الأمان والاعتمادية.</p>
          </section>
          <section>
            <h2 className="font-bold text-lg mb-1">الاستخدام والمشاركة</h2>
            <p>تستخدم الطلبات لتقديم نتائج البحث والنصوص القانونية وتشخيص الأعطال. لا نبيع البيانات الشخصية ولا نستخدم طلبات MCP للإعلانات أو إنشاء ملفات تعريف للمستخدمين. تمر البيانات كذلك عبر ChatGPT وفق إعدادات وسياسة حساب المستخدم لدى OpenAI.</p>
          </section>
          <section>
            <h2 className="font-bold text-lg mb-1">المصادر والاحتفاظ</h2>
            <p>النصوص القانونية بيانات عامة مأخوذة من المصادر المبينة في المكتبة. لا ينشئ خادم MCP سجلاً دائماً لأسئلة المستخدمين، باستثناء سجلات الاستضافة التقنية التي يديرها مزود الخدمة وفق إعداداته.</p>
          </section>
          <section>
            <h2 className="font-bold text-lg mb-1">التواصل</h2>
            <p>للاستفسارات أو طلبات الخصوصية، استخدم قسم Issues في مستودع المشروع على GitHub.</p>
          </section>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/" className="text-accent underline">العودة إلى المكتبة</Link>
          <a href="https://github.com/yahyaaljudiey-rgb/yemeni-laws/issues" className="text-accent underline">التواصل عبر GitHub</a>
          <Link href="/terms.html" className="text-accent underline">شروط الاستخدام</Link>
        </div>
      </article>
    </main>
  );
}
