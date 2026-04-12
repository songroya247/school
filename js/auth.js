// ============================================================
// auth.js — UltimateEdge School
// Patched: Batch 1 (fixes bugs #1–6)
// ============================================================

// ── CREDENTIALS (replace with your real values) ──
const SUPA_URL = "YOUR_SUPABASE_URL";   // ← paste your Supabase project URL
const SUPA_KEY = "YOUR_ANON_KEY";       // ← paste your Supabase anon key
const sb = supabase.createClient(SUPA_URL, SUPA_KEY);

window.sb          = sb;
window.currentUser    = null;
window.currentProfile = null;           // FIX #2: declared so other scripts don't crash

// ── TOAST NOTIFICATION (FIX #4) ──
window.toast = function(msg, type = 'info') {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = `toast toast--${type} toast--visible`;
    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => el.classList.remove('toast--visible'), 3500);
};

// ── XP SYSTEM (FIX #5) ──
window.addXP = async function(amount) {
    if (!window.currentUser || !window.currentProfile) return;
    const newXP = (window.currentProfile.total_xp || 0) + amount;
    window.currentProfile.total_xp = newXP;
    await sb.from('profiles').update({ total_xp: newXP }).eq('id', window.currentUser.id);
    const xpEl = document.getElementById('nav-xp');
    if (xpEl) xpEl.textContent = `${newXP} XP`;
};

// ── MODAL CONTROL (FIX #6: tab switching now works) ──
window.openAuthModal = function(tab = 'login') {
    const modal = document.getElementById('auth-modal');
    if (!modal) return;
    modal.classList.add('active');
    // Switch visible tab
    modal.querySelectorAll('.auth-tab-content').forEach(el => el.style.display = 'none');
    modal.querySelectorAll('.auth-tab-btn').forEach(el => el.classList.remove('active'));
    const target = modal.querySelector(`[data-tab="${tab}"]`);
    const btn    = modal.querySelector(`[data-tab-btn="${tab}"]`);
    if (target) target.style.display = 'block';
    if (btn)    btn.classList.add('active');
};

window.closeAuthModal = function() {
    const modal = document.getElementById('auth-modal');
    if (modal) modal.classList.remove('active');
};

// ── DEFAULTER / ACCESS GUARD (FIX #3) ──
function checkAccess() {
    if (!window.currentProfile) return;

    const banner     = document.getElementById('defaulter-banner');
    const isPremium  = window.currentProfile.is_premium;
    const expiryRaw  = window.currentProfile.subscription_expiry;
    const expiryDate = expiryRaw ? new Date(expiryRaw) : null;
    const isExpired  = expiryDate && expiryDate < new Date();

    // 1. Silently update DB if subscription lapsed (FIX: correct column name)
    if (isPremium && isExpired) {
        sb.from('profiles')
          .update({ is_premium: false, subscription_status: 'EXPIRED' })
          .eq('id', window.currentUser.id);
        window.currentProfile.is_premium = false;
        window.currentProfile.subscription_status = 'EXPIRED';
    }

    // 2. Show/hide defaulter banner
    const showBanner = isExpired || window.currentProfile.subscription_status === 'EXPIRED';
    if (banner) {
        if (showBanner) {
            banner.classList.add('active');
            banner.innerHTML = `⚠️ Your subscription has expired.
                <a href="index.html#pricing" style="color:#fff;font-weight:700;">Renew Now →</a>`;
        } else {
            banner.classList.remove('active');
        }
    }

    // 3. Page restriction — CBT is allowed in free/drill mode (FIX: removed cbt.html)
    const restrictedPages = ['classroom.html', 'dashboard.html'];
    const currentPage = window.location.pathname;
    if (showBanner && restrictedPages.some(p => currentPage.includes(p))) {
        window.toast("Subscription expired. Redirecting…", 'error');
        setTimeout(() => { window.location.href = 'index.html#pricing'; }, 3000);
    }
}

// ── USAGE TRACKING ──
window.trackAction = async function(action) {
    if (!window.currentUser || !window.currentProfile) return;
    const log   = { action, ts: new Date().toISOString() };
    const logs  = Array.isArray(window.currentProfile.usage_logs)
                  ? window.currentProfile.usage_logs : [];
    logs.push(log);
    window.currentProfile.usage_logs = logs;
    await sb.rpc('append_usage_log', { user_id: window.currentUser.id, log_entry: log });
};

// ── COMMITMENT SCORE ──
window.calcCommitmentScore = function(usageLogs) {
    if (!usageLogs || !Array.isArray(usageLogs)) return 0;
    const weights = {
        'page_view': 0.5, 'video_started': 1, 'video_completed': 3,
        'drill_attempted': 2, 'drill_completed': 3, 'login_streak': 2
    };
    return Math.round(usageLogs.reduce((t, l) => t + (weights[l.action] || 0), 0));
};

// ── GRADE URL RESOLVER ──
window.resolveGradeUrl = async function(topicId, grade) {
    const gradePath    = `/lessons/${topicId}/grade${grade}/index.html`;
    const standardPath = `/lessons/${topicId}/index.html`;
    try {
        const res = await fetch(gradePath, { method: 'HEAD' });
        return res.ok ? gradePath : standardPath;
    } catch { return standardPath; }
};

// ── SIGNUP ──
window.handleSignup = async function(name, email, password, exams, examDate, targetScore) {
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) { window.toast(error.message, 'error'); return; }

    // Create profile row
    await sb.from('profiles').insert({
        id: data.user.id, full_name: name, email,
        exams_selected: exams, exam_date: examDate,
        target_jamb_score: targetScore || 280,
        subscription_status: 'NIL'
    });

    // Seed topic_mastery rows with NIL status (accuracy_avg = NULL)
    const { data: curriculum } = await sb.from('topic_mastery').select('topic_id').limit(1);
    // Topics seeded by DB trigger — nothing extra needed here

    window.toast("Account created! Check your email to verify.", 'success');
    window.closeAuthModal();
};

// ── LOGIN ──
window.handleLogin = async function(email, password) {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) { window.toast(error.message, 'error'); return; }
    window.toast("Welcome back!", 'success');
    window.closeAuthModal();
    location.reload();
};

// ── LOGOUT ──
window.handleLogout = async function() {
    await sb.auth.signOut();
    window.currentUser    = null;
    window.currentProfile = null;
    window.location.href  = 'index.html';
};

// ── CORE INIT (FIX #2: loads profile into window.currentProfile) ──
async function initAuth() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return;

    window.currentUser = session.user;

    // Load profile
    const { data: profile } = await sb
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

    if (profile) {
        window.currentProfile = profile;

        // Update nav
        const loginBtn  = document.getElementById('nav-login-btn');
        const userPill  = document.getElementById('nav-user-pill');
        const userName  = document.getElementById('nav-user-name');
        const xpEl      = document.getElementById('nav-xp');
        const proBadge  = document.getElementById('nav-pro-badge');

        if (loginBtn)  loginBtn.style.display  = 'none';
        if (userPill)  userPill.style.display  = 'flex';
        if (userName)  userName.textContent    = profile.full_name?.split(' ')[0] || 'Student';
        if (xpEl)      xpEl.textContent        = `${profile.total_xp || 0} XP`;
        if (proBadge)  proBadge.style.display  = profile.is_premium ? 'inline-flex' : 'none';

        // Run access guard
        checkAccess();

        // Notify other scripts
        window.dispatchEvent(new CustomEvent('ue_auth_ready', { detail: profile }));
    }
}

document.addEventListener('DOMContentLoaded', initAuth);
