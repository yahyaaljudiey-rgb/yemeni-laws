// Service Worker لتطبيق Yemeni Laws
// قابلية التثبيت + عمل دون إنترنت: قشرة التطبيق وملفاتها الثابتة تُحفظ عند التثبيت.
// اسم الكاش وقائمة PRECACHE يكتبهما scripts/prepare-offline.mjs بعد البناء.
const CACHE = "yemeni-laws-99992bb61e93";
const PRECACHE = ["_next/static/PtWH5Upl-CkoH-cZ4ZYF-/_buildManifest.js","_next/static/PtWH5Upl-CkoH-cZ4ZYF-/_clientMiddlewareManifest.js","_next/static/PtWH5Upl-CkoH-cZ4ZYF-/_ssgManifest.js","_next/static/chunks/05-c3ty_6dwfk.js","_next/static/chunks/06gll188ollc_.js","_next/static/chunks/07p9s0sr6c_e_.js","_next/static/chunks/0ay_9enm-oca4.css","_next/static/chunks/0cz1d0mv5g_q7.js","_next/static/chunks/0hxjrx7qiix3f.js","_next/static/chunks/0yd4wm_xl528v.js","_next/static/chunks/14mrh2-p_w84d.js","_next/static/chunks/1_g7lfknqed_x.js","_next/static/chunks/1eh432qibk3fg.js","_next/static/chunks/1lt_0x45hcmlt.js","_next/static/chunks/1r4t_08ra1lyf.js","_next/static/chunks/1rxncug86bump.js","_next/static/chunks/1sx025bk40pan.js","_next/static/chunks/1xmi2ogzfsfv6.js","_next/static/chunks/2-y0x7mt_4p6c.js","_next/static/chunks/20io994aitrqn.js","_next/static/chunks/27jktro2p5rq9.js","_next/static/chunks/2967wwm48502f.js","_next/static/chunks/2j_nuphh9gn95.js","_next/static/chunks/2ktlf8onebdc9.js","_next/static/chunks/2nykiepra7i1k.js","_next/static/chunks/2paik__6lqogw.js","_next/static/chunks/2r-7ha1vi_jib.js","_next/static/chunks/2ssb6hdte51-8.js","_next/static/chunks/2yk2o0n8t5er0.js","_next/static/chunks/3-e-j3wdjyfnb.js","_next/static/chunks/31eug7h4obino.js","_next/static/chunks/35fijd-m-nx0o.js","_next/static/chunks/3b0-trbsxycrt.js","_next/static/chunks/3hgsoqftffrih.js","_next/static/chunks/3nh4z6sr_xyno.js","_next/static/chunks/3vp-sry1a6j9x.js","_next/static/chunks/turbopack-1fjemj4vcxa9z.js","_next/static/media/05d29f0ed5b0e698-s.p.1mou8v493x-u7.woff2","_next/static/media/1062333f2bd32cfe-s.p.1u_72eqgml40c.woff2","_next/static/media/291696193ea1e96b-s.p.1zf0xf1cyi65q.woff2","_next/static/media/648474ecaeaf4c9a-s.p.3bws0utn4kpyc.woff2","_next/static/media/966a9c3087fc8ac2-s.17y8b371423uo.woff2","_next/static/media/9ff27b8a0a8f3dc0-s.p.40_3w74kn95bo.woff2","_next/static/media/a5b03b231ce290a0-s.0nlsxckj73qpt.woff2","_next/static/media/d41831e24743a3c1-s.p.08tn9snzkmifr.woff2","_next/static/media/d48a75a69535be63-s.2otm1xqa4lz8q.woff2","_next/static/media/favicon.04bs2xyz0fbbn.ico","_next/static/media/ort-wasm-simd-threaded.2e-x1qvrucsty.wasm","_next/static/media/ort.wasm.bundle.min.1gng_g2hni118.mjs"];
// كاش المكتبة يديره lib/offline-library.ts ويبقى بعد تحديث التطبيق؛ لا يُحذف هنا.
const LIBRARY_CACHE = "yl-library-v1";
// قارئ خط اليد (lib/htr.ts) ينزّله المستخدم بطلبه (نحو 28MB) في كاشه yl-htr-*؛ يبقى بعد التحديث ولا يُكرَّر هنا.
const KEEP = (k) => k === CACHE || k === LIBRARY_CACHE || k.startsWith("yl-htr-");
// مسار القاعدة: يُشتقّ من موقع ملفّ الـSW نفسه ليعمل على الجذر أو على مسار فرعي
// (مثل GitHub Pages: user.github.io/yemeni-laws/sw.js → BASE = "/yemeni-laws").
const BASE = self.location.pathname.replace(/\/sw\.js$/, "");
const APP_SHELL = [
  `${BASE}/`,
  `${BASE}/manifest.webmanifest`,
  `${BASE}/icon-192x192.png`,
  `${BASE}/icon-512x512.png`,
  ...PRECACHE.map((file) => `${BASE}/${file}`),
];

self.addEventListener("install", (event) => {
  // كل ملف على حدة: فشل ملف واحد على شبكة ضعيفة لا يُسقط حفظ البقية.
  event.waitUntil(
    caches.open(CACHE).then((cache) => Promise.allSettled(APP_SHELL.map((url) => cache.add(url)))),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !KEEP(k)).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.pathname.startsWith(`${BASE}/api/`)) return; // طلبات API للشبكة مباشرة
  // ملف التطبيق (APK) تنزيل كبير: لا يُعترض ولا يُخزَّن، وإلا عرض الكاشُ الصفحةَ الرئيسية بدله على شبكة بطيئة.
  if (url.pathname.endsWith(".apk")) return;

  // أجزاء المكتبة وبيانها وقائمة القوانين: يحفظها التطبيق بنفسه ويتحقق منها؛ لا نكرر تخزينها هنا.
  if (/\/data\/(packs\/|related-|library\.json$|laws\.json$|meta\.json$)/.test(url.pathname)) return;
  if (url.pathname.startsWith(`${BASE}/ocr/htr/`) && !url.pathname.endsWith(".mjs")) return;

  if (url.pathname.startsWith(`${BASE}/data/`)) {
    // بقية البيانات (الأحكام والعلاقات): «الكاش أولاً» لتفادي إعادة التنزيل في كل زيارة.
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
            }
            return res;
          }),
      ),
    );
    return;
  }

  // ملفات البناء ذات البصمة لا تتغير: من الكاش فورًا دون انتظار شبكة بطيئة.
  if (url.pathname.startsWith(`${BASE}/_next/static/`)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
            }
            return res;
          }),
      ),
    );
    return;
  }

  // فتح الصفحة: الشبكة أولًا، لكن بعد 4 ثوانٍ على شبكة بطيئة تُعرض النسخة المحفوظة فورًا
  // ويستمر الطلب في الخلفية ليحدّث الكاش للزيارة التالية.
  if (request.mode === "navigate") {
    const network = fetch(request).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
      }
      return res;
    });
    event.waitUntil(network.catch(() => {}));
    const saved = () => caches.match(request).then((c) => c || caches.match(`${BASE}/`));
    const slow = new Promise((resolve) => setTimeout(resolve, 4000)).then(saved);
    event.respondWith(
      Promise.race([network, slow.then((cached) => cached || network)])
        .catch(() => saved())
        .then((res) => res || saved()),
    );
    return;
  }

  // بقيّة الأصول: «الشبكة أولاً» ثم الكاش
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(request).then((c) => c || caches.match(`${BASE}/`))),
  );
});
