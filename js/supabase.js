/* ═══════════════════════════════════════════════════
   UltimateEdge School — Supabase Client
   Single source of truth. Import on every page.
═══════════════════════════════════════════════════ */

const SUPABASE_URL  = 'https://hazwqyvnolgdkokehjhr.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhendxeXZub2xnZGtva2VoamhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMDUwNzYsImV4cCI6MjA5MTY4MTA3Nn0.V7TsNcfpib2HtJRjTASyJPavQ8qUR2R4KXYuWdZB4gE';

// Load Supabase from CDN (injected once via script tag in HTML)
// This module just exposes the initialised client
let _supabase = null;

function getSupabase() {
  if (_supabase) return _supabase;
  if (typeof window !== 'undefined' && window.supabase) {
    _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
    return _supabase;
  }
  throw new Error('Supabase SDK not loaded. Add the CDN script tag before this file.');
}

// Convenience shorthand used across all pages
window.sb = null; // set after DOMContentLoaded in each page
