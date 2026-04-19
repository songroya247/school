/* ═══════════════════════════════════════════════════
   UE School — Auth Logic
   Handles: signup (4-step), login, forgot-password,
            reset-password, profile creation on first signup.
═══════════════════════════════════════════════════ */

const AUTH = (function () {

  // ── Helpers ───────────────────────────────────────

  function showError(msg) {
    const el = document.getElementById('auth-error');
    if (!el) { toast(msg); return; }
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 5000);
  }

  function clearError() {
    const el = document.getElementById('auth-error');
    if (el) { el.textContent = ''; el.style.display = 'none'; }
  }

  function setLoading(btnId, loading, label = 'Continue →') {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.disabled = loading;
    btn.innerHTML = loading
      ? '<span class="spinner"></span> Please wait…'
      : label;
  }

  function val(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  // ── TARGET SCORE MAPPING ──────────────────────────
  // Maps the select string to an integer midpoint
  function parseTargetScore(str) {
    const map = {
      '200–220': 210, '221–240': 230, '241–260': 250,
      '261–280': 270, '281–300': 290, '301–320': 310, '320+': 330
    };
    return map[str] || 250;
  }

  // ── CREATE PROFILE (called after email confirm, or at signup) ──
  async function createProfile(user, formData) {
    const { error } = await window.sb.from('profiles').insert({
      id:                  user.id,
      full_name:           formData.fullName,
      email:               user.email,
      exam_types:          formData.examTypes,
      exam_date:           formData.examDate || null,
      target_score:        formData.targetScore,
      current_skill_level: 3,
      accuracy_avg:        null,
      mastery_level:       null,
      status:              'NIL',
      is_premium:          false,
      exam_subjects:       formData.subjects,
      study_mode:          formData.studyMode,
      smartpath_queue:     [],
      total_xp:            0,
      usage_logs:          []
    });
    return error;
  }

  // ── SIGNUP ────────────────────────────────────────

  // ── Build the redirect URL robustly ──────────────────────────────
  // window.location.origin alone is enough for most hosts.
  // For GitHub Pages subdirectory deploys the pathname prefix is needed.
  // We also strip any trailing /index.html so the URL is clean.
  function buildRedirectUrl(page) {
    const origin  = window.location.origin; // e.g. https://school.ultimateedge.info
    const path    = window.location.pathname
      .replace(/\/[^/]*\.html$/, '') // remove filename
      .replace(/\/$/, '');           // remove trailing slash
    // path will be '' for root domains, '/subfolder' for subdirectory deploys
    return origin + path + '/' + page;
  }

  async function handleSignup(formData) {
    clearError();
    setLoading('btn-create-account', true, 'Creating account…');

    try {
      const redirectUrl = buildRedirectUrl('confirm.html');

      const { data, error } = await window.sb.auth.signUp({
        email:    formData.email,
        password: formData.password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            // Store form data in user metadata for use after confirmation
            full_name:    formData.fullName,
            exam_types:   JSON.stringify(formData.examTypes),
            exam_date:    formData.examDate || '',
            target_score: String(formData.targetScore),
            subjects:     JSON.stringify(formData.subjects),
            study_mode:   formData.studyMode
          }
        }
      });

      if (error) { showError(error.message); return; }

      // Check if Supabase auto-confirmed (rare, but handle it)
      if (data.session) {
        // Auto-confirmed — create profile immediately
        await createProfile(data.user, formData);
        window.location.href = 'dashboard.html';
        return;
      }

      // Normal flow — email confirmation required
      // Save form data to sessionStorage so confirm.html can use it
      sessionStorage.setItem('ue_pending_profile', JSON.stringify(formData));
      window.location.href = 'confirm.html?email=' + encodeURIComponent(formData.email);

    } catch (err) {
      showError('Something went wrong. Please try again.');
      console.error(err);
    } finally {
      setLoading('btn-create-account', false, 'Create Account');
    }
  }

  // ── PROFILE CREATION AFTER EMAIL CONFIRM ─────────

  async function handlePostConfirm() {
    // Called on confirm.html after user clicks email link and lands back
    const session = (await window.sb.auth.getSession()).data.session;
    if (!session) return;

    // Check if profile already exists
    const { data: existing } = await window.sb
      .from('profiles').select('id').eq('id', session.user.id).maybeSingle();

    if (existing) {
      // Profile exists — go to dashboard
      window.location.href = 'dashboard.html';
      return;
    }

    // Try to rebuild profile from user metadata
    const meta = session.user.user_metadata || {};
    const formData = {
      fullName:    meta.full_name || session.user.email.split('@')[0],
      email:       session.user.email,
      examTypes:   tryParse(meta.exam_types, []),
      examDate:    meta.exam_date || null,
      targetScore: parseInt(meta.target_score) || 250,
      subjects:    tryParse(meta.subjects, []),
      studyMode:   meta.study_mode || 'drill'
    };

    // Also check sessionStorage fallback
    const pending = sessionStorage.getItem('ue_pending_profile');
    const merged  = pending ? { ...formData, ...JSON.parse(pending) } : formData;

    await createProfile(session.user, merged);
    sessionStorage.removeItem('ue_pending_profile');
    window.location.href = 'dashboard.html';
  }

  function tryParse(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
  }

  // ── LOGIN ─────────────────────────────────────────

  async function handleLogin(email, password) {
    clearError();
    setLoading('btn-login', true, 'Logging in…');

    try {
      const { data, error } = await window.sb.auth.signInWithPassword({
        email, password
      });

      if (error) {
        if (error.message.includes('Email not confirmed')) {
          showError('Please confirm your email first. Check your inbox.');
        } else if (error.message.includes('Invalid login credentials')) {
          showError('Incorrect email or password. Please try again.');
        } else {
          showError(error.message);
        }
        return;
      }

      // Check for intended destination
      const params = new URLSearchParams(window.location.search);
      const next   = params.get('next') || 'dashboard.html';
      window.location.href = decodeURIComponent(next);

    } catch (err) {
      showError('Something went wrong. Please try again.');
    } finally {
      setLoading('btn-login', false, 'Login');
    }
  }

  // ── FORGOT PASSWORD ───────────────────────────────

  async function handleForgotPassword(email) {
    clearError();
    setLoading('btn-forgot', true, 'Sending…');

    try {
      const { error } = await window.sb.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/reset-password.html'
      });

      if (error) { showError(error.message); return; }

      // Show success state
      document.getElementById('forgot-form').style.display = 'none';
      document.getElementById('forgot-success').style.display = 'block';

    } catch (err) {
      showError('Something went wrong. Please try again.');
    } finally {
      setLoading('btn-forgot', false, 'Send Reset Link');
    }
  }

  // ── RESET PASSWORD ────────────────────────────────

  async function handleResetPassword(newPassword) {
    clearError();
    setLoading('btn-reset', true, 'Updating…');

    try {
      const { error } = await window.sb.auth.updateUser({ password: newPassword });

      if (error) { showError(error.message); return; }

      toast('Password updated successfully!');
      setTimeout(() => { window.location.href = 'login.html'; }, 1800);

    } catch (err) {
      showError('Something went wrong. Please try again.');
    } finally {
      setLoading('btn-reset', false, 'Set New Password');
    }
  }

  // ── TRACK ACTION ──────────────────────────────────

  async function trackAction(action, meta = {}) {
    if (!window.UE_USER_ID) return;
    try {
      await window.sb.rpc('append_usage_log', {
        uid:   window.UE_USER_ID,
        entry: { action, ...meta, ts: new Date().toISOString() }
      });
    } catch {}
  }

  return {
    handleSignup,
    handleLogin,
    handleForgotPassword,
    handleResetPassword,
    handlePostConfirm,
    createProfile,
    trackAction
  };

})();
