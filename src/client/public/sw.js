// Hand-rolled service worker (no build step). Goal: the idle game opens and
// runs offline after one online visit. The simulation already lives in the
// browser with a localStorage save, so we just need the app shell + the last
// content catalog available without the network.

const SHELL = 'fp-shell-v3';
const CONTENT = 'fp-content-v3';

self.addEventListener('install', (event) => {
  // Cache the app shell entry; hashed /assets/* are picked up on first fetch.
  event.waitUntil(caches.open(SHELL).then((c) => c.add('/')).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== SHELL && k !== CONTENT).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request, cacheName, fallbackKey) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(fallbackKey ?? request, res.clone());
    return res;
  } catch {
    const cached = await cache.match(fallbackKey ?? request);
    if (cached) return cached;
    throw new Error('offline and not cached');
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res && res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // never cache saves (PUT) or other writes

  const url = new URL(request.url);

  // App navigations: serve the shell network-first so updates flow but the app
  // still opens offline.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, SHELL, '/'));
    return;
  }

  // Game content: keep the latest, fall back to it when offline.
  if (url.pathname.endsWith('/api/content')) {
    event.respondWith(networkFirst(request, CONTENT));
    return;
  }

  // Other API calls (e.g. cloud save GET): network-only; the client handles
  // failures and leans on its local save.
  if (url.pathname.includes('/api/')) return;

  // Build output is content-hashed and immutable — cache-first.
  if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, SHELL));
  }
});
