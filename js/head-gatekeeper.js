/* ═══════════════════════════════════════════════════════════════════
   UE School — js/head-gatekeeper.js

   PURPOSE: Hide the page body instantly to prevent a flash of
   protected content. That is ALL this file does.

   auth-guard.js — loaded later with the real Supabase SDK — makes
   the ONLY authoritative redirect decision. It calls the SDK's own
   getSession(), which always reads localStorage correctly regardless
   of Supabase version or storage format changes.

   WHY THIS APPROACH:
   Any gatekeeper that parses localStorage directly is fragile:
   - Supabase has changed its storage format across versions
   - The CDN serves the latest version, which may not match expectations
   - Parsing errors silently fail → redirect to login → loop
   Letting the SDK parse its own storage eliminates this class of bug.

   LOAD ORDER (every protected page):
     <head>
       <script src="js/config.js"></script>
       <script src="js/head-gatekeeper.js"></script>  ← this file
     </head>
     <body>
       ...
       <script src="supabase.min.js"></script>
       <script src="js/auth-guard.js"></script>       ← does the real check
     </body>
═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var cfg         = window.UE_CONFIG || {};
  var currentPage = window.location.pathname.split('/').pop() || 'index.html';
  var PROTECTED   = cfg.PROTECTED_PAGES || ['dashboard.html', 'classroom.html', 'cbt.html', 'report.html'];

  // Not a protected page — nothing to do
  if (PROTECTED.indexOf(currentPage) === -1) return;

  // Hide the body immediately so the user never sees a flash of content.
  // auth-guard.js removes this veil after it validates the session.
  var veil = document.createElement('style');
  veil.id = 'ue-gatekeeper-veil';
  veil.textContent = 'body{visibility:hidden!important}';
  (document.head || document.documentElement).appendChild(veil);

  // Fallback: if auth-guard.js never loads (e.g. network error),
  // reveal the body after 5 seconds rather than leaving a blank page.
  window.__ueGatekeeperTimer = setTimeout(function () {
    var v = document.getElementById('ue-gatekeeper-veil');
    if (v) v.remove();
    document.body.style.visibility = '';
  }, 5000);

})();
