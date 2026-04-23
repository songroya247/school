/* ═══════════════════════════════════════════════════════════════════
   UE School — js/head-gatekeeper.js
   ▸ PURPOSE : Prevent "Flash of Protected Content" (FOPC).
   ▸ WHERE   : Place this <script> tag at the VERY TOP of <head>,
               BEFORE any CSS link, font, or body content.
   ▸ HOW     : Reads the Supabase session synchronously from
               localStorage.  If no valid session exists the browser
               is immediately redirected — the rest of the page never
               renders.  If a session IS found, it seeds
               window.UE_USER so every later script can consume it
               without an extra round-trip to Supabase.

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
═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ── Step 1: Resolve config ──────────────────────────────────────
  //  UE_CONFIG is defined by config.js which loads just before this.
  //  Provide a safe fallback in case of load-order mistakes.
  var cfg = window.UE_CONFIG || {};
  var LOGIN_PAGE   = cfg.LOGIN_PAGE   || 'login.html';
  var PRICING_PAGE = cfg.PRICING_PAGE || 'pricing.html';

  // ── Step 2: Determine which page we are on ─────────────────────
  var currentPage = window.location.pathname.split('/').pop() || 'index.html';

  var PROTECTED = cfg.PROTECTED_PAGES ||
    ['dashboard.html', 'classroom.html', 'cbt.html', 'report.html'];

  var PREMIUM_REQUIRED = cfg.PREMIUM_PAGES ||
    ['classroom.html', 'cbt.html'];

  var needsAuth    = PROTECTED.indexOf(currentPage)      !== -1;
  var needsPremium = PREMIUM_REQUIRED.indexOf(currentPage) !== -1;

  if (!needsAuth) return; // public page — nothing to do

  // ── Step 3: Read session from localStorage (SYNCHRONOUS) ────────
  //  Supabase v2 persists the session under a key that follows the
  //  pattern:  sb-<project-ref>-auth-token
  //  We scan for it rather than hardcode the project ref so this
  //  script survives a project migration.
  var session = null;

  try {
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key && key.indexOf('sb-') === 0 && key.indexOf('-auth-token') !== -1) {
        var raw = localStorage.getItem(key);
        if (raw) {
          var parsed = JSON.parse(raw);
          // Supabase stores { access_token, expires_at, user, … }
          // expires_at is a UNIX timestamp (seconds)
          if (parsed && parsed.access_token) {
            var expiresAt = parsed.expires_at || 0;
            var nowSecs   = Math.floor(Date.now() / 1000);
            if (expiresAt > nowSecs) {
              session = parsed;
            }
            // Even an expired token is found — we'll let auth-guard
            // handle the refresh below via UE_USER.expired flag.
            if (!session && parsed.access_token) {
              session = parsed;
              session._expired = true;
            }
          }
        }
        break;
      }
    }
  } catch (e) {
    // localStorage blocked (private mode with strict settings) — treat as no session
    session = null;
  }

  // ── Step 4: Hard-redirect if no session at all ─────────────────
  if (!session) {
    // Guard: don't redirect if we just came FROM login (avoids
    // a race on very slow connections where localStorage hasn't
    // been written yet by the time gatekeeper runs on next page).
    var referrer = document.referrer || '';
    var comingFromLogin = referrer.indexOf('login.html') !== -1 ||
                          referrer.indexOf('confirm.html') !== -1;
    if (comingFromLogin) {
      // Let auth-guard.js handle it — it will redirect properly
      // once the SDK has a chance to refresh the session.
      return;
    }
    window.location.replace(
      LOGIN_PAGE + '?next=' + encodeURIComponent(currentPage)
    );
    throw new Error('[UE Gatekeeper] No session — redirecting to login.');
  }

  // ── Step 5: Seed window.UE_USER for downstream scripts ─────────
  //  This is a LIGHTWEIGHT seed only — no DB call yet.
  //  auth-guard.js will fully validate and enrich this object.
  var user = (session.user) ? session.user : {};

  // Build the global UE_USER object (non-enumerable to reduce console noise)
  Object.defineProperty(window, 'UE_USER', {
    value: {
      id:           user.id           || null,
      email:        user.email        || null,
      full_name:    (user.user_metadata && user.user_metadata.full_name) || null,
      access_token: session.access_token,
      _expired:     !!session._expired,
      // Premium status is UNKNOWN at this stage — auth-guard.js sets it
      is_premium:   null,
    },
    writable:     true,   // auth-guard.js will overwrite with real profile data
    configurable: true,
    enumerable:   true,
  });

  // ── Step 6: Expired token fast-path ────────────────────────────
  //  The token exists but has expired.  Hide the body until
  //  auth-guard.js either refreshes the session or redirects.
  if (session._expired) {
    // Inject a temporary style to keep the page invisible
    var s = document.createElement('style');
    s.id = 'ue-gatekeeper-veil';
    s.textContent = 'body{visibility:hidden!important}';
    // document.head may not exist yet (we're at top of <head>)
    // but createElement+appendChild works fine in partial parse state
    (document.head || document.documentElement).appendChild(s);
  }

  // ── Step 7: Premium page — optimistic client-side check ────────
  //  A definitive check is done in auth-guard.js with a DB read.
  //  This is just a best-effort early redirect using cached profile
  //  data stored by auth-guard on last visit.
  if (needsPremium) {
    try {
      var cachedProfile = sessionStorage.getItem('ue_profile_cache');
      if (cachedProfile) {
        var prof = JSON.parse(cachedProfile);
        var expiry = prof.subscription_expiry ? new Date(prof.subscription_expiry) : null;
        var isPremium = prof.is_premium && expiry && expiry > new Date();
        if (!isPremium) {
          // Not premium according to cache — soft redirect now,
          // auth-guard will confirm after DB read.
          window.location.replace(
            PRICING_PAGE + '?reason=premium_required&next=' + encodeURIComponent(currentPage)
          );
          throw new Error('[UE Gatekeeper] Premium required — redirecting to pricing.');
        }
      }
    } catch (e2) {
      // If it's our own Error re-throw it; otherwise ignore cache parse errors
      if (e2.message && e2.message.indexOf('[UE Gatekeeper]') === 0) throw e2;
    }
  }

})();
