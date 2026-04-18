/* ═══════════════════════════════════════════════════
   UE School — Auth Guard
   Include on every PROTECTED page (dashboard, classroom, cbt, report).
   Include with guard=false on public pages (index) to only load session.
═══════════════════════════════════════════════════ */

const AUTH_GUARD = (function () {

  // Pages that do NOT require login
  const PUBLIC_PAGES = ['index.html', 'login.html', 'confirm.html',
                        'forgot-password.html', 'reset-password.html',
                        'report.html', ''];

  const PROTECTED_PAGES = ['dashboard.html', 'classroom.html', 'cbt.html'];

  // ── Internal helpers ──────────────────────────────

  function currentPage() {
    return window.location.pathname.split('/').pop() || 'index.html';
  }

  function isProtected() {
    return PROTECTED_PAGES.includes(currentPage());
  }

  // ── Session  ──────────────────────────────────────

  async function getSession() {
    const { data: { session } } = await window.sb.auth.getSession();
    return session;
  }

  async function getProfile(userId) {
    const { data, error } = await window.sb
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) return null;
    return data;
  }

  // ── Subscription status helpers ───────────────────

  function subscriptionStatus(profile) {
    if (!profile) return 'NIL';
    if (!profile.is_premium) return 'NIL';
    if (!profile.subscription_expiry) return 'NIL';
    const expiry = new Date(profile.subscription_expiry);
    if (expiry < new Date()) return 'EXPIRED';
    return 'ACTIVE';
  }

  function isPremium(profile) {
    return subscriptionStatus(profile) === 'ACTIVE';
  }

  // ── Nav rendering ─────────────────────────────────

  function renderNavUser(profile) {
    // Try dashboard-specific named elements first, fall back to nav-right replacement
    const avatarEl   = document.getElementById('nav-avatar');
    const nameEl     = document.getElementById('nav-user-name');
    const xpEl       = document.getElementById('nav-xp');
    const streakEl   = document.getElementById('nav-streak');

    const initials = (profile.full_name || 'U')
      .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

    const status   = subscriptionStatus(profile);
    const proBadge = status === 'ACTIVE'
      ? '<span class="nav-pro-badge">PRO</span>' : '';

    if (avatarEl) {
      avatarEl.innerHTML = initials + proBadge;
    }
    if (nameEl) {
      nameEl.textContent = profile.full_name.split(' ').slice(0,2).join(' ');
    }
    if (xpEl) {
      xpEl.textContent = `${profile.total_xp ?? 0} XP`;
    }
    // streak rendered by dashboard.js from usage_logs

    // If none of those exist — fall back to replacing nav-right (public pages)
    if (!avatarEl && !nameEl) {
      const rightEl = document.getElementById('nav-right');
      if (!rightEl) return;
      rightEl.innerHTML = `
        <div class="nav-user-pill">
          <div class="nav-avatar" style="position:relative">
            ${initials}${proBadge}
          </div>
          <span style="font-weight:700;font-size:.9rem">
            ${profile.full_name.split(' ')[0]}
          </span>
        </div>
        <button class="btn btn-outline btn-sm" onclick="AUTH_GUARD.logout()">Logout</button>
      `;
    }
  }

  function renderDefaulterBanner(profile) {
    const banner = document.getElementById('defaulter-banner');
    if (!banner) return;
    const status = subscriptionStatus(profile);
    if (status === 'EXPIRED') {
      banner.style.display = 'block';
    } else {
      banner.style.display = 'none';
    }
  }

  // ── Logout ────────────────────────────────────────

  async function logout() {
    await window.sb.auth.signOut();
    window.location.href = 'login.html';
  }

  // ── Main init ─────────────────────────────────────

  async function init() {
    // Initialise Supabase client
    window.sb = window.supabase.createClient(
      'https://hazwqyvnolgdkokehjhr.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhendxeXZub2xnZGtva2VoamhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMDUwNzYsImV4cCI6MjA5MTY4MTA3Nn0.V7TsNcfpib2HtJRjTASyJPavQ8qUR2R4KXYuWdZB4gE'
    );

    const session = await getSession();

    if (isProtected() && !session) {
      // Not logged in — redirect to login
      window.location.href = 'login.html?next=' + encodeURIComponent(currentPage());
      return null;
    }

    if (session) {
      // Attach auth state change listener
      window.sb.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') {
          window.location.href = 'login.html';
        }
      });

      // Load profile
      const profile = await getProfile(session.user.id);

      if (profile) {
        renderNavUser(profile);
        renderDefaulterBanner(profile);
      }

      // Expose globally for other scripts
      window.UE_SESSION = session;
      window.UE_PROFILE = profile;
      window.UE_USER_ID = session.user.id;

      return { session, profile };
    }

    return null;
  }

  return {
    init,
    getSession,
    getProfile,
    logout,
    subscriptionStatus,
    isPremium
  };

})();
