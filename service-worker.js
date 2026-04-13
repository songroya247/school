/* ── UltimateEdge School — service-worker.js v4.1 ── */
/* PWA caching · offline support */
/* IMPORTANT: This file must live at the ROOT of the site, not inside /js/ */

const CACHE_NAME = 'ue-school-v4-1';

// Files to pre-cache on install (shell resources)
const PRECACHE = [
  '/',
  '/index.html',
  '/login.html',
  '/dashboard.html',
  '/classroom.html',
  '/cbt.html',
  '/report.html',
  '/css/main.css',
  '/js/app.js',
  '/js/auth.js',
  '/js/ai-engine.js',
  '/js/cbt-engine.js',
];

// ─── INSTALL ──────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// ─── ACTIVATE ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ─── FETCH STRATEGY ───────────────────────────────────────────────────────────
// Strategy:
//   - Supabase API calls → Network only (never cache auth/data requests)
//   - CDN scripts (Supabase JS, Paystack, Chart.js, Google Fonts) → Cache then network update
//   - Local HTML/CSS/JS → Stale-while-revalidate
//   - Everything else → Network with cache fallback

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 1. Never intercept Supabase API calls
  if (url.hostname.includes('supabase.co') ||
      url.hostname.includes('supabase.io')) {
    return; // Let it go to network directly
  }

  // 2. Never intercept Paystack calls
  if (url.hostname.includes('paystack.co') ||
      url.hostname.includes('paystack.com')) {
    return;
  }

  // 3. CDN resources — cache with network update (stale-while-revalidate)
  if (url.hostname.includes('cdn.jsdelivr.net') ||
      url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  // 4. Same-origin requests — stale-while-revalidate
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  // 5. Everything else — network with cache fallback
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// ─── STALE-WHILE-REVALIDATE ───────────────────────────────────────────────────
async function staleWhileRevalidate(request) {
  const cache    = await caches.open(CACHE_NAME);
  const cached   = await cache.match(request);

  const fetchPromise = fetch(request)
    .then(response => {
      if (response && response.status === 200) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  // Return cached immediately if available, otherwise wait for network
  return cached || await fetchPromise;
}
