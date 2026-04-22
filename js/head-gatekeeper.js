/* ═══════════════════════════════════════════════════════════════════
   UE School — js/head-gatekeeper.js
   ▸ PURPOSE : Prevent "Flash of Protected Content" (FOPC).
   ▸ WHERE   : Place this <script> tag at the VERY TOP of <head>,
               BEFORE any CSS link, font, or body content.

   STORAGE FORMAT COMPATIBILITY
   ────────────────────────────
   Supabase JS v2 has used two localStorage formats depending on version:

   Format A (pre-2.39, "flat"):
     { access_token, refresh_token, expires_at, user, … }

   Format B (2.39+, "wrapped"):
     { currentSession: { access_token, refresh_token, expires_at, user }, expiresAt }

   This gatekeeper handles BOTH so it works regardless of which CDN
   version is served. auth-guard.js uses the real SDK and is always
   format-agnostic — this file is the only one that reads raw storage.
═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var cfg          = window.UE_CONFIG || {};
  var LOGIN_PAGE   = cfg.LOGIN_PAGE   || 'login.html';
  var PRICING_PAGE = cfg.PRICING_PAGE || 'pricing.html';

  var currentPage = window.location.pathname.split('/').pop() || 'index.html';

  var PROTECTED        = cfg.PROTECTED_PAGES || ['dashboard.html', 'classroom.html', 'cbt.html', 'report.html'];
  var PREMIUM_REQUIRED = cfg.PREMIUM_PAGES   || ['classroom.html', 'cbt.html'];

  var needsAuth    = PROTECTED.indexOf(currentPage)       !== -1;
  var needsPremium = PREMIUM_REQUIRED.indexOf(currentPage) !== -1;

  if (!needsAuth) return;

  // ── Read & parse session — supports both Supabase v2 storage formats ──
  var tokenData    = null;
  var accessToken  = null;
  var expiresAt    = 0;
  var userObj      = null;

  try {
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (!key) continue;

      // Match: sb-*-auth-token  OR  sb-*-auth-token.0  (chunked large tokens)
      var isAuthKey = key.indexOf('sb-') === 0 && key.indexOf('-auth-token') !== -1;
      if (!isAuthKey) continue;

      var raw = localStorage.getItem(key);
      if (!raw) continue;

      var parsed = JSON.parse(raw);
      if (!parsed) continue;

      // ── Format B (Supabase 2.39+): { currentSession: {...}, expiresAt }
      if (parsed.currentSession && parsed.currentSession.access_token) {
        tokenData   = parsed.currentSession;
        accessToken = parsed.currentSession.access_token;
        expiresAt   = parsed.currentSession.expires_at || parsed.expiresAt || 0;
        userObj     = parsed.currentSession.user || {};
        break;
      }

      // ── Format A (pre-2.39): { access_token, expires_at, user, … }
      if (parsed.access_token) {
        tokenData   = parsed;
        accessToken = parsed.access_token;
        expiresAt   = parsed.expires_at || 0;
        userObj     = parsed.user || {};
        break;
      }
    }
  } catch (e) {
    // localStorage blocked (strict private mode) — no session
  }

  // ── No token found at all → redirect to login ──────────────────
  if (!accessToken) {
    window.location.replace(LOGIN_PAGE + '?next=' + encodeURIComponent(currentPage));
    throw new Error('[UE Gatekeeper] No session — redirecting to login.');
  }

  // ── Check expiry ────────────────────────────────────────────────
  var nowSecs  = Math.floor(Date.now() / 1000);
  var expired  = expiresAt > 0 && expiresAt < nowSecs;

  // ── Seed window.UE_USER (lightweight — auth-guard.js enriches it) ─
  Object.defineProperty(window, 'UE_USER', {
    value: {
      id:           (userObj && userObj.id)    || null,
      email:        (userObj && userObj.email) || null,
      full_name:    (userObj && userObj.user_metadata && userObj.user_metadata.full_name) || null,
      access_token: accessToken,
      _expired:     expired,
      is_premium:   null,
    },
    writable: true, configurable: true, enumerable: true,
  });

  // ── Expired: hide body until auth-guard.js refreshes the token ──
  if (expired) {
    var veil = document.createElement('style');
    veil.id = 'ue-gatekeeper-veil';
    veil.textContent = 'body{visibility:hidden!important}';
    (document.head || document.documentElement).appendChild(veil);
  }

  // ── Premium optimistic check (best-effort, DB check done in auth-guard) ─
  if (needsPremium) {
    try {
      var cached = sessionStorage.getItem('ue_profile_cache');
      if (cached) {
        var prof      = JSON.parse(cached);
        var subExpiry = prof.subscription_expiry ? new Date(prof.subscription_expiry) : null;
        var hasPremium = prof.is_premium && subExpiry && subExpiry > new Date();
        if (!hasPremium) {
          window.location.replace(PRICING_PAGE + '?reason=premium_required&next=' + encodeURIComponent(currentPage));
          throw new Error('[UE Gatekeeper] Premium required.');
        }
      }
    } catch (e2) {
      if (e2.message && e2.message.indexOf('[UE Gatekeeper]') === 0) throw e2;
    }
  }

})();
