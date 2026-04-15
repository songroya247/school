/* ═══════════════════════════════════════════════════════════
   UE School — service-worker.js  v4.1
   ⚠️  This file MUST remain at ROOT (/service-worker.js)
   NOT in /js/ — service workers are scoped to their directory.
   ═══════════════════════════════════════════════════════════ */

const CACHE_NAME   = 'ue-school-v4.1';
const OFFLINE_PAGE = '/index.html';

/* Assets to pre-cache on install */
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/classroom.html',
  '/cbt.html',
  '/css/main.css',
  '/js/auth.js',
  '/js/ai-engine.js',
  '/js/cbt-engine.js',
  '/js/paystack.js',
];

/* ── INSTALL ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_ASSETS).catch(err => {
        console.warn('Pre-cache partial failure (non-fatal):', err);
      });
    })
  );
  self.skipWaiting();
});

/* ── ACTIVATE ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

/* ── FETCH ── */
self.addEventListener('fetch', event => {
  const { request } = event;

  /* Skip non-GET and Supabase/Paystack API calls — always go to network */
  if (request.method !== 'GET') return;
  if (request.url.includes('supabase.co') ||
      request.url.includes('paystack.co') ||
      request.url.includes('fonts.googleapis.com') ||
      request.url.includes('cdn.jsdelivr.net')) return;

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request).then(response => {
        /* Cache successful HTML + CSS + JS responses */
        if (response.ok && ['document', 'script', 'style'].includes(request.destination)) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      }).catch(() => {
        /* Offline fallback for navigation requests */
        if (request.destination === 'document') {
          return caches.match(OFFLINE_PAGE);
        }
      });
    })
  );
});

/* ── BACKGROUND SYNC (for queued response_logs) ── */
self.addEventListener('sync', event => {
  if (event.tag === 'sync-response-logs') {
    event.waitUntil(
      /* The actual sync happens in cbt-engine.js flushOfflineQueue()
         which is triggered by the 'online' event on the page. */
      Promise.resolve()
    );
  }
});
