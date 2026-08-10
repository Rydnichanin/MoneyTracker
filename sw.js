// Service Worker — Учёт Курьера Pro
// Версия кэша — увеличивается при каждом обновлении приложения
const CACHE_VERSION = 'v4-ai-parser';
const CACHE_NAME = 'courier-' + CACHE_VERSION;
const PRECACHE = ['/', '/index.html', '/style.css'];
const RUNTIME_CACHE = 'courier-runtime-' + CACHE_VERSION;
const CACHEABLE_ORIGINS = ['https://www.gstatic.com'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE).catch(e => console.warn('[SW] Precache partial fail:', e))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => ![CACHE_NAME, RUNTIME_CACHE].includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.hostname.includes('firestore.googleapis.com') || url.hostname.includes('identitytoolkit.googleapis.com') || url.hostname.includes('firebaseapp.com') || url.hostname.includes('securetoken.googleapis.com') || url.hostname.includes('anthropic.com') || (url.hostname.includes('googleapis.com') && url.pathname.includes('/v1beta/models')) || url.hostname.includes('openai.com') || url.hostname.includes('dashscope.aliyuncs.com') || url.hostname.includes('generativelanguage.googleapis.com')) return;
  if (url.pathname === '/' || url.pathname.endsWith('index.html')) { event.respondWith(networkFirst(event.request)); return; }
  if (CACHEABLE_ORIGINS.some(o => url.origin === o)) { event.respondWith(cacheFirst(event.request)); return; }
  if (url.pathname.endsWith('.css') || url.pathname.endsWith('.js')) event.respondWith(cacheFirst(event.request));
});
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try { const response = await fetch(request, {cache:'no-store'}); if (response.ok) await cache.put(request, response.clone()); return response; }
  catch(e) { const cached = await cache.match(request); if (cached) return cached; return new Response('<html><body style="background:#000;color:#fff">Нет подключения</body></html>', {headers:{'Content-Type':'text/html; charset=utf-8'}}); }
}
async function cacheFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE); const cached = await cache.match(request);
  if (cached) { fetch(request, {cache:'no-store'}).then(r => { if (r.ok) cache.put(request, r); }).catch(() => {}); return cached; }
  try { const response = await fetch(request, {cache:'no-store'}); if (response.ok) await cache.put(request, response.clone()); return response; }
  catch(e) { return new Response('', {status:503}); }
}
