/* ═══════════════════════════════════════════════════════════════════
   UE School — js/head-gatekeeper.js  (HARDENED v3)

   ▸ PURPOSE : Prevent "Flash of Protected Content" (FOPC) and avoid
               the redirect-loop / blank-page issues caused by the
               older v1/v2 gatekeeper that assumed a single, plain-JSON
               Supabase auth token in localStorage.

   ▸ WHAT CHANGED (v3):
       • Handles ALL three Supabase JS v2 storage shapes:
           - plain JSON          → {"access_token":"…","expires_at":…,…}
           - base64-prefixed     → "base64-eyJhbGciOi…"
           - chunked across keys → sb-<ref>-auth-token
                                   sb-<ref>-auth-token.0
                                   sb-<ref>-auth-token.1 …
       • NEVER hides <body> with `visibility:hidden !important`.
         The old veil left the page blank whenever auth-guard.js
         failed for any reason (slow network, RLS error, throw in
         a downstream script, etc.).
       • Removed the optimistic premium pre-redirect — it caused
         legitimate paid users to be bounced to /pricing on the
         very first visit to /classroom.html before the cache was
         seeded. auth-guard.js is now the single source of truth.
       • If a session cannot be confidently parsed, the gatekeeper
         simply returns and lets auth-guard.js handle it via the
         Supabase SDK (which knows every storage format natively).

   ▸ LOAD ORDER (unchanged):
       <head>
         <script src="js/config.js"></script>
         <script src="js/head-gatekeeper.js"></script>
         … fonts, CSS …
       </head>
       <body>
         …
         <script src="…supabase.min.js"></script>
         <script src="js/auth-guard.js"></script>
       </body>
═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ── Step 1: Resolve config ───────────────────────────────────────
  var cfg        = window.UE_CONFIG || {};
  var LOGIN_PAGE = cfg.LOGIN_PAGE || 'login.html';
  var PROTECTED  = cfg.PROTECTED_PAGES ||
    ['dashboard.html', 'classroom.html', 'cbt.html', 'report.html'];

  // ── Step 2: Determine which page we are on ───────────────────────
  var currentPage = window.location.pathname.split('/').pop() || 'index.html';
  if (PROTECTED.indexOf(currentPage) === -1) return; // public page

  // ── Step 3: Try every known Supabase v2 storage format ──────────
  //   We DO NOT try to detect "expired" here. The SDK refreshes
  //   silently — guessing the wrong expiry just hides the page.
  var session = readSupabaseSession();

  // ── Step 4: No session? Redirect, unless we just came from login.
  if (!session) {
    var ref = document.referrer || '';
    var fromAuthFlow =
      ref.indexOf('login.html')   !== -1 ||
      ref.indexOf('confirm.html') !== -1 ||
      ref.indexOf('reset-password.html') !== -1;

    // After login/confirm the SDK may not have written localStorage
    // yet on very slow connections. Let auth-guard.js handle it.
    if (fromAuthFlow) return;

    window.location.replace(
      LOGIN_PAGE + '?next=' + encodeURIComponent(currentPage)
    );
    return;
  }

  // ── Step 5: Seed window.UE_USER for downstream scripts ──────────
  var user = (session.user) ? session.user : {};
  try {
    Object.defineProperty(window, 'UE_USER', {
      value: {
        id:           user.id    || null,
        email:        user.email || null,
        full_name:    (user.user_metadata && user.user_metadata.full_name) || null,
        access_token: session.access_token || null,
        // Premium status is UNKNOWN at this stage; auth-guard.js fills it in.
        is_premium:   null,
      },
      writable:     true,
      configurable: true,
      enumerable:   true,
    });
  } catch (_) { /* property already defined — non-fatal */ }


  /* ─────────────────────────────────────────────────────────────────
     Supabase v2 storage parser.
     Returns a session-like object { access_token, user } or null.
     Never throws.
  ───────────────────────────────────────────────────────────────── */
  function readSupabaseSession() {
    try {
      // 1. Find the primary auth-token key (e.g. sb-<ref>-auth-token).
      var primaryKey = null;
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k) continue;
        if (k.indexOf('sb-') === 0 &&
            k.indexOf('-auth-token') !== -1 &&
            // exclude chunk keys: sb-…-auth-token.0, .1, …
            !/-auth-token\.\d+$/.test(k) &&
            // exclude code-verifier helper keys
            k.indexOf('-auth-token-code-verifier') === -1) {
          primaryKey = k;
          break;
        }
      }
      if (!primaryKey) return null;

      var raw = localStorage.getItem(primaryKey);
      if (!raw) return null;

      // 2. If the value is a JSON array of strings, the token was
      //    chunked across multiple keys. Reassemble it.
      //    Example: ["sb-<ref>-auth-token.0","sb-<ref>-auth-token.1"]
      if (raw.charAt(0) === '[') {
        try {
          var parts = JSON.parse(raw);
          if (Array.isArray(parts)) {
            var assembled = parts
              .map(function (key) { return localStorage.getItem(key) || ''; })
              .join('');
            raw = assembled;
          }
        } catch (_) { /* fall through to other parsers */ }
      }

      // 3. base64-prefixed format introduced in newer Supabase clients.
      if (raw.indexOf('base64-') === 0) {
        try {
          // atob handles ASCII; decodeURIComponent+escape rebuilds UTF-8.
          var b64 = raw.slice(7);
          var decoded = decodeURIComponent(escape(atob(b64)));
          raw = decoded;
        } catch (_) { return null; }
      }

      // 4. Plain JSON object.
      var obj;
      try { obj = JSON.parse(raw); } catch (_) { return null; }
      if (!obj) return null;

      // The SDK sometimes nests the session under .currentSession
      // (legacy gotrue-js format).
      var s = obj.currentSession || obj;

      if (!s || !s.access_token) return null;
      return s;
    } catch (_) {
      return null;
    }
  }
})();
