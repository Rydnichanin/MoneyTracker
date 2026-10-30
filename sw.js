// ── Service Worker: кэш статики приложения ──────────────────────
// Кэшируем оболочку приложения и статику.
// Firebase/Firestore запросы не кэшируем — это живые данные.

const CACHE_NAME = 'courier-app-v10';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon.png',
  './style.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Принудительно запрашиваем свежие файлы из сети, минуя любой HTTP-кэш (cache: 'reload')
      await Promise.all(
        APP_SHELL.map((url) =>
          fetch(new Request(url, { cache: 'reload' }))
            .then((res) => {
              if (res && res.ok) return cache.put(url, res);
            })
            .catch((err) => console.warn('[SW] Ошибка кэширования ресурса:', url, err))
        )
      );
    })
  );
  // Активируем сразу в фоне без показа всплывающих баннеров пользователю
  self.skipWaiting();
});

// Получаем команду от приложения на применение обновления
self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Удаляем ВСЕ старые кэши предыдущих версий
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      );
      await self.clients.claim();
      // Оповещаем все открытые окна о завершении активации обновления
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientList) {
        client.postMessage({ action: 'swActivated', version: CACHE_NAME });
      }
    })()
  );
});

// Обработка клика по push-уведомлению (переход в приложение)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // version.json ВСЕГДА берём строго из сети без какого-либо кэша
  if (url.pathname.endsWith('version.json')) {
    event.respondWith(
      fetch(new Request(req, { cache: 'no-store' })).catch(() => new Response('{}'))
    );
    return;
  }

  // Для навигации (HTML страница) — Network First с обновлением кэша, fallback на кэш
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(new Request(req, { cache: 'reload' })).then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return res;
      }).catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // Для статических файлов (CSS, JS, иконки, манифест) — Stale While Revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(new Request(req, { cache: 'reload' })).then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
