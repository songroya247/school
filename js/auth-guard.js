/* ═══════════════════════════════════════════════════════════════════
   UE School — js/auth-guard.js
   ▸ Runs AFTER the Supabase SDK and config.js are loaded.
   ▸ Performs the full async session + premium validation.
   ▸ head-gatekeeper.js already stopped unauth'd page renders;
     this module handles the nuanced cases:
       • Expired tokens that Supabase can silently refresh
       • Premium-gating for classroom.html and cbt.html
       • Auth-state-change listener (tab re-focus, token rotation)
       • Profile hydration, nav rendering, XP/streak display
═══════════════════════════════════════════════════════════════════ */

const AUTH_GUARD = (function () {
  'use strict';

  // ── Config from centralised source ─────────────────────────────
  const cfg          = window.UE_CONFIG;
  const SUPABASE_URL  = cfg.SUPABASE_URL;
  const SUPABASE_ANON = cfg.SUPABASE_ANON;
  const LOGIN_PAGE    = cfg.LOGIN_PAGE   || 'login.html';
  const PRICING_PAGE  = cfg.PRICING_PAGE || 'pricing.html';
  const PREMIUM_PAGES = cfg.PREMIUM_PAGES || ['classroom.html', 'cbt.html'];

  // ── Toast helper ───────────────────────────────────────────────
  function showToast(message, type = 'info', duration = 5000) {
    const existing = document.getElementById('ue-auth-toast');
    if (existing) existing.remove();

    const colours = {
      info:    { bg: '#1a56ff', icon: 'ℹ️' },
      warning: { bg: '#d97706', icon: '⚠️' },
      error:   { bg: '#dc2626', icon: '🚫' },
      success: { bg: '#059669', icon: '✅' },
    };
    const c = colours[type] || colours.info;

    const toast = document.createElement('div');
    toast.id = 'ue-auth-toast';
    toast.style.cssText = `
      position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(80px);
      background:${c.bg};color:#fff;padding:14px 22px;border-radius:12px;
      font-family:inherit;font-size:.9rem;font-weight:600;z-index:99999;
      box-shadow:0 8px 32px rgba(0,0,0,.25);max-width:90vw;text-align:center;
      transition:transform .35s cubic-bezier(.34,1.56,.64,1);
      display:flex;align-items:center;gap:10px;
    `;
    toast.innerHTML = `<span>${c.icon}</span><span>${message}</span>`;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        toast.style.transform = 'translateX(-50%) translateY(0)';
      });
    });

    setTimeout(() => {
      toast.style.transform = 'translateX(-50%) translateY(80px)';
      setTimeout(() => toast.remove(), 400);
    }, duration);
  }

  // ── Remove veil injected by head-gatekeeper ────────────────────
  function liftVeil() {
    if (window.__ueGatekeeperTimer) clearTimeout(window.__ueGatekeeperTimer);
    const veil = document.getElementById('ue-gatekeeper-veil');
    if (veil) veil.remove();
    document.body.style.visibility = '';
  }

  // ── Current page helper ─────────────────────────────────────────
  function currentPage() {
    return window.location.pathname.split('/').pop() || 'index.html';
  }

  // ── Global redirect lock — prevents any double-navigation ──────
  let _redirecting = false;

  function safeRedirectToLogin(reason) {
    if (_redirecting) return;
    _redirecting = true;
    const page = currentPage();
    // Never redirect to login from a public/auth page
    if (page === LOGIN_PAGE || page === 'confirm.html' || page === 'index.html' ||
        page === 'pricing.html' || page === 'forgot-password.html') return;
    window.location.replace(
      LOGIN_PAGE + '?next=' + encodeURIComponent(page) +
      (reason ? '&reason=' + encodeURIComponent(reason) : '')
    );
  }

  function safeRedirectToPricing(reason) {
    if (_redirecting) return;
    _redirecting = true;
    const page = currentPage();
    if (page === PRICING_PAGE) return;
    window.location.replace(
      PRICING_PAGE + '?reason=' + encodeURIComponent(reason || 'premium_required') +
      '&next=' + encodeURIComponent(page)
    );
  }

  // ── Session fetch (uses SDK for auto-refresh) ───────────────────
  async function getSession() {
    const { data: { session }, error } = await window.sb.auth.getSession();
    if (error) return null;
    return session;
  }

  // ── Profile fetch ───────────────────────────────────────────────
  async function getProfile(userId) {
    const { data, error } = await window.sb
      .from('profiles')
      .select(
        'id, full_name, email, is_premium, subscription_expiry, ' +
        'total_xp, accuracy_avg, mastery_level, status, ' +
        'exam_types, exam_date, target_score, target_grade, current_skill_level, ' +
        'report_share_token, usage_logs, exam_subjects, study_mode, ' +
        'smartpath_queue, created_at'
      )
      .eq('id', userId)
      .single();

    if (error) {
      console.error('[AUTH_GUARD] Profile fetch error:', error.message);
      return null;
    }

    try {
      sessionStorage.setItem('ue_profile_cache', JSON.stringify({
        is_premium:          data.is_premium,
        subscription_expiry: data.subscription_expiry,
      }));
    } catch (_) {}

    return data;
  }

  // ── Subscription status ─────────────────────────────────────────
  function subscriptionStatus(profile) {
    if (!profile)                     return 'NIL';
    if (!profile.is_premium)          return 'NIL';
    if (!profile.subscription_expiry) return 'NIL';
    const expiry = new Date(profile.subscription_expiry);
    if (expiry < new Date())          return 'EXPIRED';
    return 'ACTIVE';
  }

  function isPremium(profile) {
    return subscriptionStatus(profile) === 'ACTIVE';
  }

  // ── Premium gate ────────────────────────────────────────────────
  function enforcePremiumGate(profile) {
    const page = currentPage();
    if (PREMIUM_PAGES.indexOf(page) === -1) return true;

    const status = subscriptionStatus(profile);
    const REDIRECT_DELAY_MS = 400;

    if (status === 'NIL') {
      showToast('This feature requires a UE School subscription. Choose a plan to continue.', 'warning', 6000);
      setTimeout(() => safeRedirectToPricing('not_subscribed'), REDIRECT_DELAY_MS);
      return false;
    }

    if (status === 'EXPIRED') {
      showToast('Your subscription has expired. Renew your plan to access this content.', 'warning', 6000);
      setTimeout(() => safeRedirectToPricing('subscription_expired'), REDIRECT_DELAY_MS);
      return false;
    }

    return true;
  }

  // ── Nav rendering ───────────────────────────────────────────────
  function renderNavUser(profile) {
    const avatarEl = document.getElementById('nav-avatar');
    const nameEl   = document.getElementById('nav-user-name');
    const xpEl     = document.getElementById('nav-xp');

    const initials = (profile.full_name || 'U')
      .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

    const status   = subscriptionStatus(profile);
    const proBadge = status === 'ACTIVE' ? '<span class="nav-pro-badge">PRO</span>' : '';

    if (avatarEl) avatarEl.innerHTML = initials + proBadge;
    if (nameEl)   nameEl.textContent = (profile.full_name || '').split(' ').slice(0, 2).join(' ');
    if (xpEl)     xpEl.textContent   = `${profile.total_xp ?? 0} XP`;

    const streakEl = document.getElementById('nav-streak');
    if (streakEl && profile && typeof calcStreak === 'function') {
      const streak = calcStreak(profile.usage_logs);
      streakEl.innerHTML = streak > 0 ? `🔥 ${streak}-day streak` : '🔥 Start streak';
    }

    if (!avatarEl && !nameEl) {
      const rightEl = document.getElementById('nav-right');
      if (!rightEl) return;
      rightEl.innerHTML = `
        <div class="nav-user-pill">
          <div class="nav-avatar" style="position:relative">${initials}${proBadge}</div>
          <span style="font-weight:700;font-size:.9rem">
            ${(profile.full_name || '').split(' ')[0]}
          </span>
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

  // ── Logout ──────────────────────────────────────────────────────
  async function logout() {
    try { sessionStorage.removeItem('ue_profile_cache'); } catch (_) {}
    try { localStorage.removeItem('ue_profile_cache'); }  catch (_) {}
    await window.sb.auth.signOut();
    window.location.replace(LOGIN_PAGE);
  }

  // ── Main init ────────────────────────────────────────────────────
  async function init() {
    // ── 1. Boot the Supabase client (idempotent) ──────────────────
    if (!window.sb) {
      if (!window.supabase) {
        console.error('[AUTH_GUARD] Supabase SDK not loaded.');
        safeRedirectToLogin('sdk_missing');
        return null;
      }
      window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
    }

    // ── 2. Get the session (SDK handles silent refresh) ───────────
    const session = await getSession();

    // Always lift the veil now — we have an answer from the SDK.
    // If we're about to redirect, lifting it first prevents a blank page.
    liftVeil();

    if (!session) {
      try { sessionStorage.removeItem('ue_profile_cache'); } catch (_) {}
      safeRedirectToLogin('no_session');
      return null;
    }

    // ── 4. Fetch the real profile from Supabase ───────────────────
    let profile = await getProfile(session.user.id);

    if (!profile) {
      // Profile missing — new user whose email was just confirmed.
      // Build it from session metadata rather than sending them to login
      // (login would immediately bounce back here because the session IS valid).
      try {
        const meta        = session.user.user_metadata || {};
        const pending     = sessionStorage.getItem('ue_pending_profile');
        const pendingData = pending ? JSON.parse(pending) : {};

        await window.sb.from('profiles').upsert({
          id:                  session.user.id,
          full_name:           pendingData.fullName    || meta.full_name    || session.user.email.split('@')[0],
          email:               session.user.email,
          exam_types:          pendingData.examTypes   || [],
          exam_date:           pendingData.examDate    || null,
          target_score:        pendingData.targetScore || null,
          target_grade:        pendingData.targetGrade || null,
          current_skill_level: 3,
          status:              'NIL',
          is_premium:          false,
          exam_subjects:       pendingData.subjects    || [],
          study_mode:          pendingData.studyMode   || 'drill',
          smartpath_queue:     [],
          total_xp:            0,
          usage_logs:          []
        }, { onConflict: 'id', ignoreDuplicates: false });

        if (pending) sessionStorage.removeItem('ue_pending_profile');
        profile = await getProfile(session.user.id);
      } catch (profileErr) {
        console.error('[AUTH_GUARD] profile auto-create failed:', profileErr);
      }

      if (!profile) {
        safeRedirectToLogin('no_profile');
        return null;
      }
    }

    // ── 5. Enforce premium gate (authoritative DB-backed check) ───
    const premiumOk = enforcePremiumGate(profile);
    if (premiumOk === false) return null;

    // ── 6. Auth-state-change listener ────────────────────────────
    //  Only act on SIGNED_OUT — every other event (INITIAL_SESSION,
    //  SIGNED_IN, TOKEN_REFRESHED) fires legitimately during normal
    //  page loads and must not trigger a redirect.
    window.sb.auth.onAuthStateChange((event, newSession) => {
      if (event === 'SIGNED_OUT') {
        try { sessionStorage.removeItem('ue_profile_cache'); } catch (_) {}
        safeRedirectToLogin('signed_out');
        return;
      }
      if (event === 'TOKEN_REFRESHED' && newSession) {
        if (window.UE_USER) window.UE_USER.access_token = newSession.access_token;
        window.UE_SESSION = newSession;
      }
    });

    // ── 7. Enrich global UE_USER with real profile data ──────────
    window.UE_USER = {
      id:           session.user.id,
      email:        session.user.email,
      full_name:    profile.full_name,
      access_token: session.access_token,
      is_premium:   isPremium(profile),
    };

    window.UE_SESSION = session;
    window.UE_PROFILE = profile;
    window.UE_USER_ID = session.user.id;

    // ── 8. Render UI ─────────────────────────────────────────────
    renderNavUser(profile);
    renderDefaulterBanner(profile);

    return { session, profile };
  }

  // ── Public API ──────────────────────────────────────────────────
  return {
    init,
    getSession,
    getProfile,
    logout,
    showToast,
    subscriptionStatus,
    isPremium,
  };

})();
