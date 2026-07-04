// Service Worker لتطبيق Yemeni Laws
// قابلية التثبيت + عمل دون إنترنت: قشرة التطبيق + حزمة البيانات الثابتة.
const CACHE = "yemeni-laws-v25";
// مسار القاعدة: يُشتقّ من موقع ملفّ الـSW نفسه ليعمل على الجذر أو على مسار فرعي
// (مثل GitHub Pages: user.github.io/yemeni-laws/sw.js → BASE = "/yemeni-laws").
const BASE = self.location.pathname.replace(/\/sw\.js$/, "");
const APP_SHELL = [
  `${BASE}/`,
  `${BASE}/manifest.webmanifest`,
  `${BASE}/icon-192x192.png`,
  `${BASE}/icon-512x512.png`,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.pathname.startsWith(`${BASE}/api/`)) return; // طلبات API للشبكة مباشرة

  // حزمة البيانات الثابتة: «الكاش أولاً» — تُحمَّل مرّة وتعمل دون إنترنت بعدها
  // (نتفادى إعادة تنزيل أجزاء المتجهات الكبيرة في كل زيارة).
  if (url.pathname.startsWith(`${BASE}/data/`)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
            return res;
          }),
      ),
    );
    return;
  }

  // بقيّة الأصول: «الشبكة أولاً» ثم الكاش
  event.respondWith(
    fetch(request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(request).then((c) => c || caches.match(`${BASE}/`))),
  );
});
