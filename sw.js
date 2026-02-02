const CACHE = "money-tracker-cloud-v1";

const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json"
];

// Установка: кэшируем только нужные файлы
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Активация: чистим старый кэш (включая v7)
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Запрос данных: сначала сеть, если нет — кэш
self.addEventListener("fetch", (e) => {
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
