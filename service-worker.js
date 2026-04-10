/* ================================================================
   service-worker.js — UltimateEdge School v2.1
   PWA: Offline caching + IndexedDB sync for response logs
   ================================================================ */

const CACHE_NAME   = 'ue-school-v2.1';
const DATA_CACHE   = 'ue-data-v2.1';
const OFFLINE_PAGE = '/index.html';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/classroom.html',
  '/cbt.html',
  '/dashboard.html',
  '/report-view.html',
  '/css/main.css',
  '/js/auth.js',
  '/js/ai-engine.js',
  '/js/paystack.js',
  '/data/curriculum.json',
  '/data/questions.json',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,700&family=DM+Mono:wght@400;500&display=swap',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js'
];

/* ── INSTALL: cache static shell ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS.filter(u => !u.startsWith('https://cdn'))))
      .then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE: clear old caches ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME && k !== DATA_CACHE)
            .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ── FETCH: network-first for API, cache-first for assets ── */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET
  if (event.request.method !== 'GET') return;

  // Supabase API calls: network-only, don't cache
  if (url.hostname.includes('supabase.co')) return;

  // Data files: network-first, fallback to cache
  if (url.pathname.startsWith('/data/')) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const clone = res.clone();
          caches.open(DATA_CACHE).then(c => c.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return res;
        });
      })
      .catch(() => caches.match(OFFLINE_PAGE))
  );
});

/* ── BACKGROUND SYNC: flush IndexedDB logs to Supabase ──────
   When connection returns, the CBT engine posts a 'sync-logs' message.
   ──────────────────────────────────────────────────────────── */
self.addEventListener('message', event => {
  if (event.data?.type === 'SYNC_LOGS') {
    // The main thread handles the actual Supabase insert via postMessage reply
    // because service workers can't import the Supabase client directly.
    event.source?.postMessage({ type: 'DO_SYNC' });
  }
});

self.addEventListener('sync', event => {
  if (event.tag === 'sync-response-logs') {
    event.waitUntil(
      self.clients.matchAll().then(clients =>
        clients.forEach(client => client.postMessage({ type: 'DO_SYNC' }))
      )
    );
  }
});
