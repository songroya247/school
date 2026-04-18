/* ═══════════════════════════════════════════════════════════════════
   UE School — js/config.js
   Single source of truth for all environment-level constants.
   Frozen at runtime — no script may overwrite these values.

   HOW TO USE:
     All other scripts read  window.UE_CONFIG.SUPABASE_URL  etc.
     Replace the two placeholder strings below with your real values.
     Never put these strings anywhere else in the codebase.
═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ── 1. Guard against double-initialisation ──────────────────────
  if (window.UE_CONFIG) return;

  // ── 2. Define the config ────────────────────────────────────────
  //
  //  NOTE ON THE ANON KEY:
  //  The Supabase anon key is intentionally *public* — it is safe to
  //  ship in client-side code AS LONG AS Row-Level Security (RLS) is
  //  enabled on every table (see schema.sql).  The key alone cannot
  //  bypass RLS; what matters is that auth.uid() is enforced in your
  //  policies, which it is.  Never put your SERVICE ROLE key here.
  //
  const _config = {
    SUPABASE_URL:  'https://hazwqyvnolgdkokehjhr.supabase.co',
    SUPABASE_ANON: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhendxeXZub2xnZGtva2VoamhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMDUwNzYsImV4cCI6MjA5MTY4MTA3Nn0.V7TsNcfpib2HtJRjTASyJPavQ8qUR2R4KXYuWdZB4gE',

    // ── App-level settings ─────────────────────────────────────────
    APP_NAME:      'UE School',
    LOGIN_PAGE:    'login.html',
    PRICING_PAGE:  'pricing.html',

    // ── Pages that require a valid Supabase session ────────────────
    PROTECTED_PAGES: ['dashboard.html', 'classroom.html', 'cbt.html', 'report.html'],

    // ── Pages that additionally require an active premium sub ─────
    PREMIUM_PAGES:   ['classroom.html', 'cbt.html'],
  };

  // ── 3. Freeze — prevents any script from mutating config values ─
  Object.defineProperty(window, 'UE_CONFIG', {
    value:        Object.freeze(_config),
    writable:     false,
    configurable: false,
    enumerable:   true,
  });

})();
