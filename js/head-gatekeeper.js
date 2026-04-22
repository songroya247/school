/* ═══════════════════════════════════════════════════════════════════
   UE School — js/head-gatekeeper.js
   ▸ PURPOSE : Prevent "Flash of Protected Content" (FOPC).
   ▸ WHERE   : Place this <script> tag at the VERY TOP of <head>,
               BEFORE any CSS link, font, or body content.
   ▸ HOW     : Reads and PARSES the Supabase session from localStorage.
               If no valid session exists the browser is immediately
               redirected — the rest of the page never renders.
               If a session IS found, it seeds window.UE_USER so every
               later script can consume it without an extra round-trip.

   LOAD ORDER for every protected page:
     <head>
       <script src="js/config.js"></script>          ← defines UE_CONFIG
       <script src="js/head-gatekeeper.js"></script>  ← this file (blocks FOPC)
       … fonts, CSS …
     </head>
     <body>
       …
       <script src="…supabase.min.js"></script>
       <script src="js/auth-guard.js"></script>       ← full async validation
       …
     </body>

   DESIGN NOTES
   ────────────
   • We PARSE the stored token and check expires_at so an expired token
     on its own never counts as a valid session. auth-guard.js will
     attempt a silent refresh for expired-but-refreshable tokens.
   • We do NOT use a ue_just_signed_in flag. That flag introduced a race
     condition: bfcache restores or double-runs consumed the flag before
     auth-guard.js could validate the session, causing a redirect loop.
     Parsing the token directly is simpler and race-free.
   • Supabase v2 chunks large tokens: sb-*-auth-token.0, .1 …
     We try the base key first, then fall back to chunk .0.
═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ── Step 1: Resolve config ──────────────────────────────────────
  var cfg          = window.UE_CONFIG || {};
  var LOGIN_PAGE   = cfg.LOGIN_PAGE   || 'login.html';
  var PRICING_PAGE = cfg.PRICING_PAGE || 'pricing.html';

  // ── Step 2: Determine which page we are on ─────────────────────
  var currentPage = window.location.pathname.split('/').pop() || 'index.html';

  var PROTECTED = cfg.PROTECTED_PAGES ||
    ['dashboard.html', 'classroom.html', 'cbt.html', 'report.html'];

  var PREMIUM_REQUIRED = cfg.PREMIUM_PAGES ||
    ['classroom.html', 'cbt.html'];

  var needsAuth    = PROTECTED.indexOf(currentPage)       !== -1;
  var needsPremium = PREMIUM_REQUIRED.indexOf(currentPage) !== -1;

  if (!needsAuth) return; // public page — nothing to do

  // ── Step 3: Read & parse session from localStorage ──────────────
  //  Supabase v2 key pattern:  sb-<project-ref>-auth-token
  //  Large tokens are chunked:  sb-<ref>-auth-token.0, .1, …
  //  We scan for the base key OR the .0 chunk (always has access_token).
  var session = null;

  try {
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (!key) continue;

      var isBase  = key.indexOf('sb-') === 0 && key.indexOf('-auth-token') !== -1 &&
                    key.indexOf('-auth-token.') === -1;
      var isChunk = key.indexOf('sb-') === 0 && key.indexOf('-auth-token.0') !== -1;

      if (!isBase && !isChunk) continue;

      var raw = localStorage.getItem(key);
      if (!raw) continue;

      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.access_token) continue;

      var expiresAt = parsed.expires_at || 0;
      var nowSecs   = Math.floor(Date.now() / 1000);

      if (expiresAt > nowSecs) {
        session = parsed;             // valid, non-expired
      } else {
        parsed._expired = true;
        session = parsed;             // expired — auth-guard.js will refresh
      }
      break;
    }
  } catch (e) {
    session = null; // localStorage blocked (strict private mode)
  }

  // ── Step 4: Hard-redirect if no session at all ─────────────────
  if (!session) {
    window.location.replace(
      LOGIN_PAGE + '?next=' + encodeURIComponent(currentPage)
    );
    throw new Error('[UE Gatekeeper] No session — redirecting to login.');
  }

  // ── Step 5: Seed window.UE_USER for downstream scripts ─────────
  var user = session.user || {};

  Object.defineProperty(window, 'UE_USER', {
    value: {
      id:           user.id                                               || null,
      email:        user.email                                           || null,
      full_name:    (user.user_metadata && user.user_metadata.full_name) || null,
      access_token: session.access_token,
      _expired:     !!session._expired,
      is_premium:   null,
    },
    writable:     true,
    configurable: true,
    enumerable:   true,
  });

  // ── Step 6: Expired token — hide body until auth-guard refreshes ─
  if (session._expired) {
    var veil = document.createElement('style');
    veil.id = 'ue-gatekeeper-veil';
    veil.textContent = 'body{visibility:hidden!important}';
    (document.head || document.documentElement).appendChild(veil);
  }

  // ── Step 7: Premium page — optimistic client-side check ────────
  //  Definitive check done in auth-guard.js with a real DB read.
  //  This is a best-effort early redirect using cached profile data.
  if (needsPremium) {
    try {
      var cachedProfile = sessionStorage.getItem('ue_profile_cache');
      if (cachedProfile) {
        var prof      = JSON.parse(cachedProfile);
        var expiry    = prof.subscription_expiry ? new Date(prof.subscription_expiry) : null;
        var isPremium = prof.is_premium && expiry && expiry > new Date();
        if (!isPremium) {
          window.location.replace(
            PRICING_PAGE + '?reason=premium_required&next=' + encodeURIComponent(currentPage)
          );
          throw new Error('[UE Gatekeeper] Premium required — redirecting to pricing.');
        }
      }
    } catch (e2) {
      if (e2.message && e2.message.indexOf('[UE Gatekeeper]') === 0) throw e2;
      // JSON parse error — ignore; auth-guard.js will do the authoritative check
    }
  }

})();
