// ── Service Worker: кэш статики приложения ──────────────────────
// Кэшируем только "оболочку" приложения (сам index.html и статику).
// Firebase/Firestore запросы НИКОГДА не кэшируем и не перехватываем —
// это живые данные, они должны всегда идти в сеть напрямую.

const CACHE_NAME = 'courier-app-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Кэшируем по одному — если какого-то файла нет (например manifest.json),
      // это не должно ломать установку всего Service Worker'а
      await Promise.all(
        APP_SHELL.map((url) => cache.add(url).catch(() => {}))
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Кэшируем только GET-запросы к нашему же origin.
  // Всё остальное (Firebase, Firestore, Google Auth, CDN скрипты и т.д.)
  // пропускаем мимо Service Worker'а — пусть идёт в сеть как обычно.
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // HTML-навигация — "network first", чтобы всегда открывать свежую версию
  // приложения, когда есть сеть, и откатываться на кэш, когда сети нет.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // Статика (js/css/картинки/манифест) — "cache first" для мгновенной загрузки,
  // с фоновым обновлением кэша.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const resClone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
