// Service Worker — Учёт Курьера Pro
// Версия кэша — меняй при обновлении index.html
const CACHE_VERSION = 'v3';
const CACHE_NAME = 'courier-' + CACHE_VERSION;

// Что кэшируем при установке
const PRECACHE = [
  '/',
  '/index.html',
  '/style.css',
];

// Firebase и внешние ресурсы — кэшируем при первом запросе
const RUNTIME_CACHE = 'courier-runtime-' + CACHE_VERSION;

// Домены которые кэшируем (stale-while-revalidate)
const CACHEABLE_ORIGINS = [
  'https://www.gstatic.com',
];

// ── Install: кэшируем основные файлы ──────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE).catch(e => {
        console.warn('[SW] Precache partial fail:', e);
      });
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: удаляем старые кэши ─────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys
        .filter(k => k !== CACHE_NAME && k !== RUNTIME_CACHE)
        .map(k => {
          console.log('[SW] Удаляю старый кэш:', k);
          return caches.delete(k);
        })
    )).then(() => self.clients.claim())
  );
});

// ── Fetch: стратегия по типу запроса ──────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Firebase Firestore/Auth — НЕ кэшируем, всегда сеть
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('firebaseapp.com') ||
    url.hostname.includes('securetoken.googleapis.com') ||
    url.hostname.includes('anthropic.com') ||
    url.hostname.includes('googleapis.com') && url.pathname.includes('/v1beta/models') ||
    url.hostname.includes('openai.com') ||
    url.hostname.includes('dashscope.aliyuncs.com') ||
    url.hostname.includes('generativelanguage.googleapis.com')
  ) {
    return; // Пропускаем — браузер сам обращается к сети
  }

  // index.html — Network First (всегда свежая версия, fallback на кэш)
  if (url.pathname === '/' || url.pathname.endsWith('index.html')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Firebase SDK (gstatic.com) — Cache First (редко меняется)
  if (CACHEABLE_ORIGINS.some(o => url.origin === o)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // style.css и прочая статика — Cache First
  if (url.pathname.endsWith('.css') || url.pathname.endsWith('.js')) {
    event.respondWith(cacheFirst(event.request));
    return;
  }
});

// ── Network First: пробуем сеть, при ошибке — кэш ─────────────
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch(e) {
    const cached = await cache.match(request);
    if (cached) return cached;
    // Возвращаем заглушку если совсем нет кэша
    return new Response(
      '<html><body style="background:#000;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;flex-direction:column;gap:16px;">' +
      '<div style="font-size:48px;">📵</div>' +
      '<div style="font-size:18px;font-weight:bold;">Нет подключения</div>' +
      '<div style="font-size:13px;color:#555;">Данные сохранены в Firebase — откроются когда появится сеть</div>' +
      '</body></html>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

// ── Cache First: берём из кэша, обновляем в фоне ──────────────
async function cacheFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  if (cached) {
    // Обновляем в фоне (stale-while-revalidate)
    fetch(request).then(r => { if (r.ok) cache.put(request, r); }).catch(() => {});
    return cached;
  }
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch(e) {
    return new Response('', { status: 503 });
  }
}
