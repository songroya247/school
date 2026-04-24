/* ═══════════════════════════════════════════════════════════════════
   UE School — js/auth-guard.js  (HARDENED v2)
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

  // ── Toast helper (used for premium-redirect messages) ──────────
  function showToast(message, type = 'info', duration = 5000) {
    // Remove existing toast
    const existing = document.getElementById('ue-auth-toast');
    if (existing) existing.remove();

    const colours = {
      info:    { bg: '#1a56ff', icon: 'ℹ' },
      warning: { bg: '#d97706', icon: '&#x26A0;&#xFE0F;' },
      error:   { bg: '#dc2626', icon: '&#x1F6AB;' },
      success: { bg: '#059669', icon: '&#x2705;' },
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

    // Animate in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        toast.style.transform = 'translateX(-50%) translateY(0)';
      });
    });

    // Auto-dismiss
    setTimeout(() => {
      toast.style.transform = 'translateX(-50%) translateY(80px)';
      setTimeout(() => toast.remove(), 400);
    }, duration);
  }

  // ── Remove the veil injected by head-gatekeeper (expired tokens) 
  function liftVeil() {
    const veil = document.getElementById('ue-gatekeeper-veil');
    if (veil) veil.remove();
    // Also un-hide body visibility in case head-gatekeeper set it inline
    document.body.style.visibility = '';
  }

  // ── Current page helper ─────────────────────────────────────────
  function currentPage() {
    return window.location.pathname.split('/').pop() || 'index.html';
  }

  // ── Redirect helpers ───────────────────────────────────────────
  function redirectToLogin(reason) {
    const page = currentPage();
    // Never redirect to login if already on a non-protected page
    if (page === LOGIN_PAGE || page === 'confirm.html' || page === 'index.html' ||
        page === 'pricing.html' || page === 'forgot-password.html') return;
    window.location.replace(
      LOGIN_PAGE + '?next=' + encodeURIComponent(page) +
      (reason ? '&reason=' + encodeURIComponent(reason) : '')
    );
  }

  function redirectToPricing(reason) {
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
  //   Uses .maybeSingle() so a missing row returns { data: null }
  //   instead of throwing PGRST116 (which the old code logged as an
  //   "error" and caused the dashboard to redirect to login on first
  //   confirm — the redirect-loop bug).
  async function getProfile(userId) {
    const { data, error } = await window.sb
      .from('profiles')
      .select(
        'id, full_name, email, phone, is_admin, is_premium, subscription_expiry, ' +
        'total_xp, accuracy_avg, mastery_level, status, ' +
        'exam_types, exam_date, target_score, target_grade, current_skill_level, ' +
        'report_share_token, usage_logs, exam_subjects, study_mode, ' +
        'smartpath_queue, created_at'
      )
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('[AUTH_GUARD] Profile fetch error:', error.message);
      return null;
    }
    if (!data) return null;

    // Cache a lightweight version for the head-gatekeeper's optimistic check
    try {
      sessionStorage.setItem('ue_profile_cache', JSON.stringify({
        is_premium:          data.is_premium,
        subscription_expiry: data.subscription_expiry,
      }));
    } catch (_) { /* storage full / blocked — non-fatal */ }

    return data;
  }

  // ── Admin pass-through ──────────────────────────────────────────
  // An admin (profiles.is_admin === true OR email in
  // UE_CONFIG.ADMIN_EMAILS) is treated as a fully-active premium
  // subscriber so they can sign up like a normal student and still
  // see/feel every premium page. The authoritative check is RLS on
  // the server; this is the front-end UX hint.
  function isAdmin(profile) {
    if (!profile) return false;
    if (profile.is_admin === true) return true;
    const list = (window.UE_CONFIG && window.UE_CONFIG.ADMIN_EMAILS) || [];
    return list.length > 0 && profile.email
      && list.map(e => e.toLowerCase()).includes(profile.email.toLowerCase());
  }

  // ── Subscription status ─────────────────────────────────────────
  function subscriptionStatus(profile) {
    if (!profile)                       return 'NIL';
    if (isAdmin(profile))               return 'ACTIVE';   // admin pass-through
    if (!profile.is_premium)            return 'NIL';
    if (!profile.subscription_expiry)   return 'NIL';
    const expiry = new Date(profile.subscription_expiry);
    if (expiry < new Date())            return 'EXPIRED';
    return 'ACTIVE';
  }

  function isPremium(profile) {
    return subscriptionStatus(profile) === 'ACTIVE';
  }

  // ── Premium content veil ────────────────────────────────────────
  //  Injected immediately on premium pages so content is NEVER
  //  visible while we wait for the async profile fetch to complete.
  //  Lifted instantly if the user is confirmed premium.
  //  If the user fails the gate we redirect before lifting it —
  //  they never see a single pixel of protected content.
  function injectPremiumVeil() {
    if (document.getElementById('ue-premium-veil')) return;
    const veil = document.createElement('div');
    veil.id = 'ue-premium-veil';
    veil.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:2147483647',
      'background:#0f172a',
      'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:center', 'gap:16px',
    ].join(';');
    veil.innerHTML = `
      <div style="width:48px;height:48px;border:4px solid #1a56ff;border-top-color:transparent;
                  border-radius:50%;animation:ue-spin .8s linear infinite"></div>
      <p style="color:#94a3b8;font-family:sans-serif;font-size:.9rem;margin:0">
        Verifying access…
      </p>
      <style>@keyframes ue-spin{to{transform:rotate(360deg)}}</style>
    `;
    // Insert as the very first child of body so nothing leaks around it
    document.body.insertBefore(veil, document.body.firstChild);
  }

  function liftPremiumVeil() {
    const veil = document.getElementById('ue-premium-veil');
    if (veil) veil.remove();
  }

  // ── Premium gate ────────────────────────────────────────────────
  //  Called AFTER the real profile has been fetched from the DB.
  //  This is the authoritative check — not the optimistic cache one.
  function enforcePremiumGate(profile) {
    const page = currentPage();
    if (PREMIUM_PAGES.indexOf(page) === -1) return; // page doesn't need premium

    const status = subscriptionStatus(profile);

    if (status === 'NIL') {
      // Redirect immediately — veil stays up so content is never exposed
      showToast(
        'This feature requires a UE School subscription. Choose a plan to continue.',
        'warning', 6000
      );
      safeRedirectToPricing('not_subscribed');
      return false;
    }

    if (status === 'EXPIRED') {
      showToast(
        'Your subscription has expired. Renew your plan to access this content.',
        'warning', 6000
      );
      safeRedirectToPricing('subscription_expired');
      return false;
    }

    // ACTIVE — confirmed premium, lift the veil and show the page
    liftPremiumVeil();
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
    const admin    = isAdmin(profile);
    const proBadge = admin
      ? '<span class="nav-pro-badge" style="background:#7c3aed">ADMIN</span>'
      : (status === 'ACTIVE'
          ? '<span class="nav-pro-badge">PRO</span>'
          : '');

    if (avatarEl) avatarEl.innerHTML = initials + proBadge;
    if (nameEl)   nameEl.textContent = (profile.full_name || '').split(' ').slice(0, 2).join(' ');
    if (xpEl)     xpEl.textContent   = `${profile.total_xp ?? 0} XP`;

    // Fallback: replace nav-right on pages that don't have avatar/name elements
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
    await window.sb.auth.signOut();
    // Clear ALL UE-owned session keys so the next user on the same
    // browser doesn't inherit pending data, profile cache, or the
    // one-shot profile-autocreate flag.
    try {
      sessionStorage.removeItem('ue_profile_cache');
      sessionStorage.removeItem('ue_pending_profile');
      sessionStorage.removeItem('ue_selected_plan');
      sessionStorage.removeItem('ue_profile_autocreate_tried');
    } catch (_) {}
    window.location.replace(LOGIN_PAGE);
  }

  // ── Global redirect lock — prevents any double-navigation ─────
  let _redirecting = false;
  function safeRedirectToLogin(reason) {
    if (_redirecting) return;
    _redirecting = true;
    redirectToLogin(reason);
  }
  function safeRedirectToPricing(reason) {
    if (_redirecting) return;
    _redirecting = true;
    redirectToPricing(reason);
  }

  // ── Main init ────────────────────────────────────────────────────
  async function init() {
    // ── 0. Veil premium pages immediately (before ANY async work) ───────
    const page = currentPage();
    if (PREMIUM_PAGES.indexOf(page) !== -1) {
      injectPremiumVeil();
    }

    // ── 1. Boot the Supabase client (idempotent) ──────────────────
    if (!window.sb) {
      if (!window.supabase) {
        console.error('[AUTH_GUARD] Supabase SDK not loaded.');
        safeRedirectToLogin('sdk_missing');
        return null;
      }
      window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
    }

    // ── 2. Get the session (SDK handles silent refresh for us) ────
    const session = await getSession();

    if (!session) {
      // No valid session (refresh failed or never existed)
      try { sessionStorage.removeItem('ue_profile_cache'); } catch (_) {}
      safeRedirectToLogin('no_session');
      return null;
    }

    // ── 3. Lift the veil (for expired-token path from gatekeeper) ─
    liftVeil();

    // ── 4. Fetch the real profile from Supabase ──────────────────
    //   Retry once with a small delay to absorb the brief window
    //   between auth-confirm and the row appearing (replication lag,
    //   slow trigger). Without this, freshly-confirmed users were
    //   bounced to login on their first dashboard load.
    let profile = await getProfile(session.user.id);
    if (!profile) {
      await new Promise(r => setTimeout(r, 500));
      profile = await getProfile(session.user.id);
    }

    if (!profile) {
      // Profile still missing — new user whose email was just confirmed.
      // Build the profile from session metadata + the sessionStorage
      // payload written during signup. We do NOT redirect them to
      // login because their session IS valid — login would just send
      // them straight back here and create an infinite loop.
      //
      // Use a one-shot session flag so we only attempt the upsert
      // once per browser tab. If the upsert keeps failing (RLS,
      // missing table, NOT NULL violation), the user is sent to
      // pricing with a friendly toast instead of looping forever.
      const ATTEMPT_KEY = 'ue_profile_autocreate_tried';
      const alreadyTried = sessionStorage.getItem(ATTEMPT_KEY) === '1';
      try { sessionStorage.setItem(ATTEMPT_KEY, '1'); } catch (_) {}

      if (!alreadyTried) {
        try {
          const meta        = session.user.user_metadata || {};
          const pending     = sessionStorage.getItem('ue_pending_profile');
          const pendingData = pending ? JSON.parse(pending) : {};

          const formData = {
            fullName:    pendingData.fullName    || meta.full_name    || session.user.email.split('@')[0],
            email:       session.user.email,
            examTypes:   pendingData.examTypes   || [],
            examDate:    pendingData.examDate    || null,
            targetScore: pendingData.targetScore || null,
            targetGrade: pendingData.targetGrade || null,
            subjects:    pendingData.subjects    || [],
            studyMode:   pendingData.studyMode   || 'drill'
          };

          const { error: upsertErr } = await window.sb.from('profiles').upsert({
            id:                  session.user.id,
            full_name:           formData.fullName,
            email:               formData.email,        // <-- now ALWAYS set
            exam_types:          formData.examTypes,
            exam_date:           formData.examDate || null,
            target_score:        formData.targetScore,
            target_grade:        formData.targetGrade,
            current_skill_level: 3,
            status:              'NIL',
            is_premium:          false,
            exam_subjects:       formData.subjects,
            study_mode:          formData.studyMode,
            smartpath_queue:     [],
            total_xp:            0,
            usage_logs:          []
          }, { onConflict: 'id', ignoreDuplicates: false });

          if (upsertErr) {
            console.error('[AUTH_GUARD] profile upsert failed:', upsertErr.message);
          } else if (pending) {
            sessionStorage.removeItem('ue_pending_profile');
          }

          // Re-fetch the profile we just created
          profile = await getProfile(session.user.id);
        } catch (profileErr) {
          console.error('[AUTH_GUARD] profile auto-create exception:', profileErr);
        }
      }

      // If still no profile, show a clear message and stop. Do NOT
      // redirect to login (that just loops back to here).
      if (!profile) {
        liftVeil();
        showToast(
          'We could not load your profile. Please contact support.',
          'error', 8000
        );
        return null;
      }
    }

    // ── 5. Enforce premium gate (authoritative DB-backed check) ───
    const premiumOk = enforcePremiumGate(profile);
    if (premiumOk === false) return null; // redirect in progress

    // ── 6. Set up auth-state-change listener ────────────────────
    // ONLY act on SIGNED_OUT. Every other event (INITIAL_SESSION,
    // SIGNED_IN, TOKEN_REFRESHED arriving without session) fires
    // legitimately during normal page loads and MUST NOT trigger a
    // redirect — we already validated the session above.
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
      is_admin:     isAdmin(profile),
      _expired:     false,
    };

    // Also expose the full objects for other scripts
    window.UE_SESSION = session;
    window.UE_PROFILE = profile;
    window.UE_USER_ID = session.user.id;  // convenience shorthand

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
    isAdmin,
  };

})();
