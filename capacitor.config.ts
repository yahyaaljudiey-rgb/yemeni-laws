import type { CapacitorConfig } from '@capacitor/cli';

// نسخة محلية مستقلّة تماماً: كل الأصول (الكود + البيانات) مُغلَّفة داخل APK
// وتُحمَّل من ملفّات الجهاز عبر مخطّط محلّي — بلا أي شبكة أو سحابة.
// معرّف مختلف عن نسخة TWA السحابية لتُثبَّت بجانبها لا فوقها.
const config: CapacitorConfig = {
  appId: 'io.github.yahyaaljudiey.yemenilaws.offline',
  appName: 'القوانين اليمنية Nexus',
  webDir: 'out',
  android: {
    // محتوى مُغلَّف محلياً؛ لا server.url إطلاقاً (لا اتصال بالسحابة)
    allowMixedContent: false,
  },
};

export default config;
