// Service Worker — Учёт Курьера Pro
const CACHE_VERSION = 'v6-startup';
const CACHE_NAME = 'courier-' + CACHE_VERSION;
const RUNTIME_CACHE = 'courier-runtime-' + CACHE_VERSION;
const PRECACHE = [
  './',
  './index.html',
  './auth.html',
  './manifest.json',
  './style.css',
  './sw.js',
  './icon.png'
];
const CACHEABLE_ORIGINS = ['https://www.gstatic.com'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE).catch(err => console.warn('[SW] Precache partial fail:', err)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => ![CACHE_NAME, RUNTIME_CACHE].includes(key))
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache Firebase, authentication or AI API traffic.
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('firebaseapp.com') ||
    url.hostname.includes('securetoken.googleapis.com') ||
    url.hostname.includes('anthropic.com') ||
    url.hostname.includes('openai.com') ||
    url.hostname.includes('dashscope.aliyuncs.com') ||
    url.hostname.includes('generativelanguage.googleapis.com') ||
    (url.hostname.includes('googleapis.com') && url.pathname.includes('/v1beta/models'))
  ) return;

  if (request.mode === 'navigate' || url.pathname.endsWith('/index.html')) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (CACHEABLE_ORIGINS.some(origin => url.origin === origin)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (/\.(css|js|png|jpg|jpeg|webp|svg|ico|woff2?)$/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(
      '<html><body style="background:#000;color:#fff;font-family:sans-serif;padding:24px">Нет подключения</body></html>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);

  const update = fetch(request, { cache: 'no-store' })
    .then(response => {
      if (response.ok) return cache.put(request, response.clone()).then(() => response);
      return response;
    })
    .catch(() => null);

  if (cached) return cached;

  const fresh = await update;
  if (fresh) return fresh;
  return new Response('', { status: 503 });
}
