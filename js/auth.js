/**
 * UltimateEdge School Auth & Session (v3.1)
 * Handles global state, Supabase client, and session modals.
 */

const SUPA_URL = "YOUR_SUPABASE_URL";
const SUPA_KEY = "YOUR_ANON_KEY";

const sb = supabase.createClient(SUPA_URL, SUPA_KEY);

window.currentUser = null;
window.currentProfile = null;
window.sb = sb; // Expose globally

document.addEventListener('DOMContentLoaded', initAuth);

async function initAuth() {
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
        window.currentUser = session.user;
        await loadProfile();
        checkAccess();
        
        // Section 11: Study Plan Welcome (Once per browser session)
        if (!sessionStorage.getItem('ue_welcome_shown')) {
            showStudyPlanWelcome();
            sessionStorage.setItem('ue_welcome_shown', 'true');
        }
    }
    updateNavUI();
    trackAction('page_view', { path: window.location.pathname });
}

async function loadProfile() {
    const { data, error } = await sb.from('profiles').select('*').eq('id', currentUser.id).single();
    if (data) {
        window.currentProfile = data;
        updateNavUI();
    }
}

function updateNavUI() {
    const userPill = document.getElementById('nav-user-pill');
    const loginBtn = document.getElementById('nav-login-btn');
    const logoutBtn = document.getElementById('nav-logout-btn');
    const xpDisplay = document.getElementById('nav-xp');

    if (currentUser && currentProfile) {
        if (loginBtn) loginBtn.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'block';
        if (userPill) {
            userPill.style.display = 'flex';
            document.getElementById('nav-user-name').textContent = currentProfile.full_name.split(' ')[0];
            document.getElementById('nav-avatar').textContent = currentProfile.full_name[0].toUpperCase();
            document.getElementById('nav-pro-badge').style.display = currentProfile.is_premium ? 'inline-block' : 'none';
        }
        if (xpDisplay) {
            xpDisplay.style.display = 'inline-block';
            xpDisplay.textContent = `${(currentProfile.total_xp || 0).toLocaleString()} XP`;
        }
    } else {
        if (loginBtn) loginBtn.style.display = 'block';
        if (logoutBtn) logoutBtn.style.display = 'none';
        if (userPill) userPill.style.display = 'none';
        if (xpDisplay) xpDisplay.style.display = 'none';
    }
}

window.trackAction = async function(action, meta = {}) {
    if (!currentUser) return;
    const log = { action, meta, ts: new Date().toISOString() };
    await sb.rpc('append_usage_log', { user_id: currentUser.id, new_log: [log] });
};

window.toast = function(msg, duration = 3000) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), duration);
};

window.addXP = async function(n, reason) {
    if (!currentUser || !currentProfile) return;
    const newXP = currentProfile.total_xp + n;
    await sb.from('profiles').update({ total_xp: newXP }).eq('id', currentUser.id);
    currentProfile.total_xp = newXP;
    updateNavUI();
    trackAction('xp_awarded', { amount: n, reason });
    toast(`+${n} XP: ${reason}`);
};

function checkAccess() {
    const banner = document.getElementById('defaulter-banner');
    if (currentProfile?.is_premium) {
        const expiry = new Date(currentProfile.subscription_expiry);
        if (expiry < new Date()) {
            banner?.classList.add('active');
            // Logic for restriction if on sensitive pages
            const restricted = ['dashboard.html', 'report-view.html'];
            if (restricted.some(p => window.location.pathname.includes(p))) {
                toast("Subscription expired. Returning to basic access.");
            }
        }
    }
}

// Global UI controls for modals
window.openAuthModal = (tab = 'login') => {
    document.getElementById('auth-modal').classList.add('active');
    switchAuthTab(tab);
};
window.closeAuthModal = () => document.getElementById('auth-modal').classList.remove('active');
window.switchAuthTab = (tab) => {
    document.querySelectorAll('.auth-tab-btn, .auth-tab-pane').forEach(el => el.classList.remove('active'));
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
    document.querySelector(`[data-pane="${tab}"]`).classList.add('active');
};

async function showStudyPlanWelcome() {
    const modal = document.getElementById('study-plan-modal');
    if (!modal || !currentProfile) return;

    // Calc months to exam
    const examDate = new Date(currentProfile.exam_date);
    const monthsDiff = Math.ceil((examDate - new Date()) / (1000 * 60 * 60 * 24 * 30));
    
    document.getElementById('sp-months').textContent = monthsDiff > 0 ? `${monthsDiff} Months` : 'Exam Month!';
    document.getElementById('sp-readiness').textContent = currentProfile.accuracy_avg ? `${Math.round(currentProfile.accuracy_avg)}%` : 'NIL';
    document.getElementById('sp-grade').textContent = `Grade ${currentProfile.current_skill_level}`;
    document.getElementById('sp-exams').textContent = currentProfile.exam_types.join(', ');

    let intensity = "3–4 sessions / week";
    if (monthsDiff <= 1) intensity = "2–3 sessions / day";
    else if (monthsDiff <= 3) intensity = "1 session / day";
    document.getElementById('sp-intensity').textContent = intensity;

    modal.classList.add('active');
}

window.handleLogin = async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    const btn = document.getElementById('login-btn');
    btn.disabled = true;
    
    const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (error) {
        toast(error.message);
        btn.disabled = false;
    } else {
        window.location.reload();
    }
};

window.handleSignup = async (e) => {
    e.preventDefault();
    const name = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const pass = document.getElementById('signup-password').value;
    const date = document.getElementById('signup-exam-date').value + "-01";
    const target = parseInt(document.getElementById('signup-target').value);
    const exams = Array.from(document.querySelectorAll('.signup-exam-check:checked')).map(c => c.value);

    if (exams.length === 0) return toast("Select at least one exam.");
    
    const btn = document.getElementById('signup-btn');
    btn.disabled = true;

    const { data, error } = await sb.auth.signUp({ email, password: pass });
    if (error) {
        toast(error.message);
        btn.disabled = false;
        return;
    }

    const { error: pError } = await sb.from('profiles').insert([{
        id: data.user.id,
        full_name: name,
        email: email,
        exam_types: exams,
        exam_date: date,
        target_score: target,
        status: 'NIL'
    }]);

    if (pError) toast(pError.message);
    else toast("Account created! Check email for verification.");
    btn.disabled = false;
};