/* ═══════════════════════════════════════════════════
   UE School — Auth Guard v2
   Three-tier access model:
     PUBLIC   — no login needed (index, about, pricing, contact, legal)
     FREE     — logged in, any user (dashboard, cbt limited, classroom preview)
     PREMIUM  — active subscription required (full CBT, all lessons)
═══════════════════════════════════════════════════ */

const AUTH_GUARD = (function () {

  const SUPABASE_URL = 'https://hazwqyvnolgdkokehjhr.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhendxeXZub2xnZGtva2VoamhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMDUwNzYsImV4cCI6MjA5MTY4MTA3Nn0.V7TsNcfpib2HtJRjTASyJPavQ8qUR2R4KXYuWdZB4gE';

  // Pages that require at minimum a free account
  const REQUIRES_LOGIN = ['dashboard.html', 'classroom.html', 'cbt.html', 'report.html'];

  // ── Step 1: Hide body immediately to prevent flash ──
  // Called synchronously the moment this script is parsed
  (function hideUntilReady() {
    const page = location.pathname.split('/').pop() || 'index.html';
    if (REQUIRES_LOGIN.includes(page)) {
      document.documentElement.style.visibility = 'hidden';
    }
  })();

  // ── Helpers ──────────────────────────────────────

  function currentPage() {
    return location.pathname.split('/').pop() || 'index.html';
  }

  function showPage() {
    document.documentElement.style.visibility = '';
  }

  async function getSession() {
    const { data: { session } } = await window.sb.auth.getSession();
    return session;
  }

  async function getProfile(userId) {
    const { data, error } = await window.sb
      .from('profiles').select('*').eq('id', userId).single();
    return error ? null : data;
  }

  // ── Subscription helpers ──────────────────────────

  function subscriptionStatus(profile) {
    if (!profile || !profile.is_premium) return 'NIL';
    if (!profile.subscription_expiry) return 'NIL';
    return new Date(profile.subscription_expiry) > new Date() ? 'ACTIVE' : 'EXPIRED';
  }

  function isPremium(profile) {
    return subscriptionStatus(profile) === 'ACTIVE';
  }

  // ── Nav rendering ─────────────────────────────────

  function renderNavUser(profile) {
    const avatarEl = document.getElementById('nav-avatar');
    const nameEl   = document.getElementById('nav-user-name');
    const xpEl     = document.getElementById('nav-xp');
    const streakEl = document.getElementById('nav-streak');

    const initials = (profile.full_name || 'U')
      .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

    const status   = subscriptionStatus(profile);
    const proBadge = status === 'ACTIVE'
      ? '<span class="nav-pro-badge">PRO</span>' : '';

    if (avatarEl) avatarEl.innerHTML = initials + proBadge;
    if (nameEl)   nameEl.textContent = (profile.full_name || '').split(' ').slice(0, 2).join(' ');
    if (xpEl)     xpEl.textContent   = `${profile.total_xp ?? 0} XP`;

    // Fallback: replace nav-right wholesale on pages without named elements
    if (!avatarEl && !nameEl) {
      const rightEl = document.getElementById('nav-right');
      if (!rightEl) return;
      rightEl.innerHTML = `
        <div class="nav-user-pill">
          <div class="nav-avatar" style="position:relative">${initials}${proBadge}</div>
          <span style="font-weight:700;font-size:.9rem">${(profile.full_name || '').split(' ')[0]}</span>
        </div>
        <button class="btn btn-outline btn-sm" onclick="AUTH_GUARD.logout()">Logout</button>
      `;
    }
  }

  function renderDefaulterBanner(profile) {
    const banner = document.getElementById('defaulter-banner');
    if (!banner) return;
    banner.style.display = subscriptionStatus(profile) === 'EXPIRED' ? 'block' : 'none';
  }

  // ── Logout ────────────────────────────────────────

  async function logout() {
    await window.sb.auth.signOut();
    window.location.href = 'index.html';
  }

  // ── Premium gate (for pages that need subscription) ──
  // Call showPremiumGate(profile) after init() if the page requires premium
  function showPremiumGate(profile, redirectUrl) {
    const status = subscriptionStatus(profile);
    if (status === 'ACTIVE') return true; // all good

    // Show a full-page upgrade prompt instead of the page content
    document.body.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;
                  background:#f0f4ff;padding:24px;font-family:'DM Sans',sans-serif">
        <div style="background:#fff;border:1.5px solid rgba(59,130,246,.15);border-radius:18px;
                    padding:48px 40px;max-width:460px;width:100%;text-align:center;
                    box-shadow:0 8px 40px rgba(26,86,255,.08)">
          <div style="font-size:3rem;margin-bottom:16px">${status === 'EXPIRED' ? '⏰' : '🔒'}</div>
          <h2 style="font-family:'Bebas Neue',sans-serif;font-size:2rem;margin-bottom:10px;color:#0f1c3f">
            ${status === 'EXPIRED' ? 'Subscription Expired' : 'Premium Required'}
          </h2>
          <p style="color:#6b7280;line-height:1.7;margin-bottom:28px;font-size:.95rem">
            ${status === 'EXPIRED'
              ? 'Your subscription has expired. Renew now to continue accessing all lessons and CBT sessions.'
              : 'This feature requires a UE School subscription — from just ₦1,500/month.'}
          </p>
          <a href="pricing.html" style="display:block;background:#1a56ff;color:#fff;padding:14px 28px;
             border-radius:10px;font-weight:700;font-size:1rem;text-decoration:none;margin-bottom:12px">
            ${status === 'EXPIRED' ? 'Renew Subscription' : 'View Plans from ₦1,500/month'}
          </a>
          <a href="dashboard.html" style="display:block;color:#6b7280;font-size:.88rem;text-decoration:none">
            ← Back to Dashboard
          </a>
        </div>
      </div>`;
    document.documentElement.style.visibility = '';
    return false;
  }

  // ── Main init ─────────────────────────────────────

  async function init() {
    // Initialise Supabase
    window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    const session = await getSession();
    const page    = currentPage();

    // Not logged in on a protected page → redirect to login
    if (REQUIRES_LOGIN.includes(page) && !session) {
      window.location.href = 'login.html?next=' + encodeURIComponent(page);
      return null;
    }

    if (session) {
      // Watch for sign-out events
      window.sb.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') window.location.href = 'login.html';
      });

      const profile = await getProfile(session.user.id);
      if (profile) {
        renderNavUser(profile);
        renderDefaulterBanner(profile);
      }

      window.UE_SESSION = session;
      window.UE_PROFILE = profile;
      window.UE_USER_ID  = session.user.id;

      showPage();
      return { session, profile };
    }

    showPage();
    return null;
  }

  return {
    init,
    getSession,
    getProfile,
    logout,
    subscriptionStatus,
    isPremium,
    showPremiumGate
  };

})();
