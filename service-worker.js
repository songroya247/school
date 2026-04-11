// ============================================================
// UltimateEdge School — service-worker.js  (v3.1)
// ⚠️  MUST be at ROOT of site, NOT in /js/ folder.
// Handles offline caching and background sync.
// ============================================================

const CACHE_NAME  = 'ue-school-v3';
const SYNC_TAG    = 'ue-sync-logs';

// Assets to pre-cache on install
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/classroom.html',
  '/cbt.html',
  '/css/main.css',
  '/js/auth.js',
  '/js/ai-engine.js',
  '/js/paystack.js',
  '/js/cbt-engine.js',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,700&family=DM+Mono:wght@400;500&display=swap',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// ── Install — pre-cache shell ─────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Cache what we can — ignore failures (CDN may block)
      return Promise.allSettled(
        PRECACHE_URLS.map(url => cache.add(url).catch(() => {}))
      );
    }).then(() => self.skipWaiting())
  );
});

// ── Activate — clean old caches ───────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch — network-first with cache fallback ─────────────────
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // Skip Supabase API calls — always go to network
  if (event.request.url.includes('supabase.co')) return;

  // Skip Paystack calls
  if (event.request.url.includes('paystack')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses
        if (response && response.status === 200) {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, cloned);
          });
        }
        return response;
      })
      .catch(() => {
        // Network failed — serve from cache
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          // Offline fallback for navigation
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});

// ── Background Sync — flush queued response_logs ──────────────
self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(syncQueuedLogs());
  }
});

async function syncQueuedLogs() {
  // The actual sync logic runs in cbt-engine.js via the 'online' event.
  // This background sync is a belt-and-suspenders fallback.
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({ type: 'SW_SYNC_REQUEST' });
  });
}

// ── Message handler ───────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
