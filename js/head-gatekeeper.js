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

  // ── Step 3: One-shot fresh-login bypass ─────────────────────────
  //  When auth.js / handlePostConfirm / signup just navigated here,
  //  the SDK may not have replayed the session into the format we
  //  expect yet. Trust the SDK — let auth-guard.js handle validation.
  try {
    if (sessionStorage.getItem('ue_just_signed_in') === '1') {
      sessionStorage.removeItem('ue_just_signed_in');
      return; // skip gatekeeper this once; auth-guard does the real check
    }
  } catch (_) { /* sessionStorage blocked — fall through */ }

  // ── Step 3b: Best-effort presence check (NOT validation) ────────
  //  We only want to know IF a session likely exists, not parse it.
  //  Any sb-*-auth-token key (including chunked .0/.1 variants)
  //  counts. Validation happens in auth-guard.js with the real SDK.
  var sessionPresent = false;
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key && key.indexOf('sb-') === 0 && key.indexOf('-auth-token') !== -1) {
        sessionPresent = true;
        break;
      }
    }
  } catch (e) {
    sessionPresent = false;
  }

  // ── Step 4: Hard-redirect if no session at all ─────────────────
  if (!sessionPresent) {
    window.location.replace(
      LOGIN_PAGE + '?next=' + encodeURIComponent(currentPage)
    );
    throw new Error('[UE Gatekeeper] No session — redirecting to login.');
  }

  // ── Step 5: Minimal optimistic seed ────────────────────────────
  //  Real values come from auth-guard.js.
  Object.defineProperty(window, 'UE_USER', {
    value: { id: null, email: null, full_name: null,
             access_token: null, _expired: false, is_premium: null },
    writable: true, configurable: true, enumerable: true,
  });

  // ── Step 6: Premium page — optimistic client-side check ────────
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
