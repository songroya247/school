// ============================================================
// UltimateEdge School — /js/auth.js  (v3.2)
// LOAD ORDER: Supabase CDN → auth.js → ai-engine.js → others
// Exposes globals: sb, currentUser, currentProfile,
//   toast(), addXP(), trackAction(), openAuthModal(),
//   closeAuthModal(), switchAuthTab(), updateNavUI(),
//   loadProfile(), openAddExamModal()
// ============================================================

const SUPA_URL = 'https://hmfbterdmgoumeeiatji.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtZmJ0ZXJkbWdvdW1lZWlhdGppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3NTAyNzYsImV4cCI6MjA5MTMyNjI3Nn0.JxC-FN5BtBf0keNPqZq8IF-q6A7LMnGoUTkrF3GyEm8';

// 20 canonical topic IDs — seeded for every new student at signup
const UE_TOPICS = [
  'quadratics','logarithms','number-bases','differentiation','integration',
  'motion','electricity','waves','optics','atomic-physics',
  'comprehension','lexis-structure','oral-english','summary','essay',
  'organic-chem','stoichiometry','periodic-table','electrolysis','acids-bases'
];

// ── Global state (window-level so all scripts share them) ────
window.sb             = null;
window.currentUser    = null;
window.currentProfile = null;

// ── Wait for Supabase CDN to load, then create client ────────
function waitForSB(cb) {
  if (typeof supabase !== 'undefined' && supabase.createClient) {
    window.sb = supabase.createClient(SUPA_URL, SUPA_KEY);
    cb();
  } else {
    setTimeout(() => waitForSB(cb), 60);
  }
}

// ── toast(msg, duration) ─────────────────────────────────────
window.toast = function(msg, duration = 3500) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), duration);
};

// ── addXP(n, reason) ─────────────────────────────────────────
window.addXP = async function(n, reason = '') {
  if (!window.currentUser || !window.sb) return;
  const newXP = (window.currentProfile?.total_xp || 0) + n;
  await window.sb.from('profiles').update({ total_xp: newXP }).eq('id', window.currentUser.id);
  if (window.currentProfile) window.currentProfile.total_xp = newXP;
  const el = document.getElementById('nav-xp');
  if (el) el.textContent = newXP.toLocaleString() + ' XP';
  if (reason) window.trackAction('xp_awarded', { amount: n, reason });
};

// ── trackAction(action, meta) ─────────────────────────────────
window.trackAction = async function(action, meta = {}) {
  if (!window.currentUser || !window.sb) return;
  const entry = { action, meta, ts: new Date().toISOString() };
  try {
    await window.sb.rpc('append_usage_log', {
      p_user_id: window.currentUser.id,
      p_entry:   entry
    });
  } catch (e) {
    console.warn('[UE] trackAction failed (non-fatal):', e.message);
  }
};

// ── loadProfile() ─────────────────────────────────────────────
window.loadProfile = async function() {
  if (!window.currentUser || !window.sb) return;
  const { data, error } = await window.sb
    .from('profiles')
    .select('*')
    .eq('id', window.currentUser.id)
    .single();
  if (!error && data) window.currentProfile = data;
};

// ── updateNavUI() ─────────────────────────────────────────────
window.updateNavUI = function() {
  const loginBtn  = document.getElementById('nav-login-btn');
  const logoutBtn = document.getElementById('nav-logout-btn');
  const userPill  = document.getElementById('nav-user-pill');
  const avatar    = document.getElementById('nav-avatar');
  const userName  = document.getElementById('nav-user-name');
  const proBadge  = document.getElementById('nav-pro-badge');
  const xpEl      = document.getElementById('nav-xp');

  if (window.currentUser && window.currentProfile) {
    if (loginBtn)  loginBtn.style.display  = 'none';
    if (logoutBtn) logoutBtn.style.display = 'inline-flex';
    if (userPill)  userPill.style.display  = 'flex';

    const p        = window.currentProfile;
    const initials = (p.full_name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
    const first    = (p.full_name || '').split(' ')[0];

    if (avatar)   avatar.textContent   = initials;
    if (userName) userName.textContent = first;
    if (xpEl)     xpEl.textContent     = (p.total_xp || 0).toLocaleString() + ' XP';

    if (proBadge) {
      proBadge.textContent   = 'PRO';
      proBadge.style.display = p.is_premium ? 'inline-block' : 'none';
    }
  } else {
    if (loginBtn)  loginBtn.style.display  = 'inline-flex';
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (userPill)  userPill.style.display  = 'none';
    if (proBadge && proBadge) proBadge.style.display = 'none';
  }
};

// ── checkAccess() — defaulter guard ──────────────────────────
window.checkAccess = async function() {
  const p = window.currentProfile;
  if (!p || !p.is_premium) return;

  const expiry = p.subscription_expiry ? new Date(p.subscription_expiry) : null;
  if (!expiry || new Date() <= expiry) return;

  // Expired — downgrade in DB
  await window.sb.from('profiles').update({
    is_premium: false, status: 'expired', subscription_status: 'EXPIRED'
  }).eq('id', window.currentUser.id);

  window.currentProfile.is_premium = false;
  window.currentProfile.status     = 'expired';

  const banner = document.getElementById('defaulter-banner');
  if (banner) banner.classList.add('active');

  const path = window.location.pathname;
  if (['/classroom.html','/cbt.html','/dashboard.html'].some(p => path.endsWith(p))) {
    window.toast('Your subscription has expired. Redirecting…');
    setTimeout(() => { window.location.href = '/index.html#pricing'; }, 2500);
  }
};

// ── showStudyPlanWelcome() ────────────────────────────────────
window.showStudyPlanWelcome = function() {
  const p = window.currentProfile;
  if (!p) return;
  if (sessionStorage.getItem('ue_sp_shown')) return;
  sessionStorage.setItem('ue_sp_shown', '1');

  const modal = document.getElementById('study-plan-modal');
  if (!modal) return;

  // Months to exam
  let monthsText = '—';
  if (p.exam_date) {
    const diff = Math.ceil((new Date(p.exam_date) - new Date()) / (1000*60*60*24*30));
    monthsText = diff > 0 ? diff + (diff === 1 ? ' month' : ' months') : 'Very soon!';
  }

  // Readiness
  const isNil     = p.accuracy_avg == null;
  const readiness = isNil
    ? '<span class="status-nil status-pill">NIL — take your first drill</span>'
    : Math.round(p.accuracy_avg) + '% accuracy';

  // Study intensity
  const months    = parseInt(monthsText) || 99;
  const intensity = months <= 1 ? '2–3 sessions/day' : months <= 3 ? '1 session/day' : '4–5 sessions/week';

  // Grade note
  const gradeDesc = { 1:'Foundational level', 2:'Intermediate level', 3:'Standard exam level' };
  const grade     = p.current_skill_level || 3;

  const setEl = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  setEl('sp-months',    monthsText);
  setEl('sp-readiness', readiness);
  setEl('sp-intensity', intensity);
  setEl('sp-grade',     gradeDesc[grade] || gradeDesc[3]);
  setEl('sp-exams',     (p.exam_types || []).join(', ') || 'Not set');

  modal.classList.add('active');
};

// ── Modal helpers ─────────────────────────────────────────────
window.openAuthModal = function(tab = 'login') {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.classList.add('active');
  window.switchAuthTab(tab);
};
window.closeAuthModal = function() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.classList.remove('active');
};
window.switchAuthTab = function(tab) {
  document.querySelectorAll('.auth-tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.auth-tab-pane').forEach(p =>
    p.classList.toggle('active', p.dataset.pane === tab));
};

// ── Add/Change exams modal ────────────────────────────────────
window.openAddExamModal = function() {
  const modal = document.getElementById('add-exam-modal');
  if (!modal || !window.currentProfile) return;
  const current = window.currentProfile.exam_types || [];
  modal.querySelectorAll('.exam-checkbox').forEach(cb => {
    cb.checked = current.includes(cb.value);
  });
  modal.classList.add('active');
};

window.saveExamChanges = async function() {
  const checked = [...document.querySelectorAll('.exam-checkbox:checked')].map(c => c.value);
  if (!checked.length) { window.toast('Select at least one exam.'); return; }
  const { error } = await window.sb.from('profiles')
    .update({ exam_types: checked }).eq('id', window.currentUser.id);
  if (error) { window.toast('Error saving. Try again.'); return; }
  window.currentProfile.exam_types = checked;
  window.toast('Exam list updated!');
  document.getElementById('add-exam-modal')?.classList.remove('active');
};

// ── SIGNUP ────────────────────────────────────────────────────
window.handleSignup = async function(e) {
  e.preventDefault();
  const btn = document.getElementById('signup-btn');
  const setBtn = (txt, dis) => { if (btn) { btn.textContent = txt; btn.disabled = dis; } };
  setBtn('Creating account…', true);

  const name        = document.getElementById('signup-name')?.value?.trim();
  const email       = document.getElementById('signup-email')?.value?.trim();
  const password    = document.getElementById('signup-password')?.value;
  const examDate    = document.getElementById('signup-exam-date')?.value;
  const targetScore = parseInt(document.getElementById('signup-target')?.value) || 250;
  const examTypes   = [...document.querySelectorAll('.signup-exam-check:checked')].map(c => c.value);

  if (!name)              { window.toast('Enter your full name.'); setBtn('Create Free Account →', false); return; }
  if (!email)             { window.toast('Enter your email.'); setBtn('Create Free Account →', false); return; }
  if (!password || password.length < 8) { window.toast('Password must be 8+ characters.'); setBtn('Create Free Account →', false); return; }
  if (!examTypes.length)  { window.toast('Select at least one exam.'); setBtn('Create Free Account →', false); return; }
  if (!examDate)          { window.toast('Select your exam month.'); setBtn('Create Free Account →', false); return; }

  const { data: authData, error: authError } = await window.sb.auth.signUp({ email, password });
  if (authError) { window.toast(authError.message); setBtn('Create Free Account →', false); return; }

  const userId = authData.user?.id;
  if (!userId) { window.toast('Signup failed. Try again.'); setBtn('Create Free Account →', false); return; }

  // Insert profile (all NIL state)
  await window.sb.from('profiles').insert({
    id: userId, full_name: name, email,
    exam_types: examTypes,
    exam_date:  examDate + '-01',
    target_score: targetScore,
    current_skill_level: 3,
    is_premium:    false,
    accuracy_avg:  null,   // NIL
    mastery_level: null,   // NIL
    status:        'NIL',
    total_xp:      0,
    usage_logs:    []
  });

  // Seed 20 topic_mastery rows — all NIL (accuracy_avg = NULL)
  await window.sb.from('topic_mastery').insert(
    UE_TOPICS.map(topic_id => ({
      user_id: userId, topic_id,
      accuracy_avg: null, mastery_level: null,
      status: 'NIL', grade_level: 3, attempts_at_grade1: 0
    }))
  );

  window.toast('Account created! Check your email to verify.', 5000);
  window.closeAuthModal();
  setBtn('Create Free Account →', false);
};

// ── LOGIN ─────────────────────────────────────────────────────
window.handleLogin = async function(e) {
  e.preventDefault();
  const btn = document.getElementById('login-btn');
  const setBtn = (txt, dis) => { if (btn) { btn.textContent = txt; btn.disabled = dis; } };
  setBtn('Signing in…', true);

  const email    = document.getElementById('login-email')?.value?.trim();
  const password = document.getElementById('login-password')?.value;

  if (!email || !password) { window.toast('Enter email and password.'); setBtn('Sign In →', false); return; }

  const { error } = await window.sb.auth.signInWithPassword({ email, password });
  if (error) {
    const msg = error.message === 'Email not confirmed'
      ? 'Please verify your email first — check your inbox.'
      : 'Login failed: ' + error.message;
    window.toast(msg);
    setBtn('Sign In →', false);
    return;
  }

  window.closeAuthModal();
  window.toast('Welcome back!');
  setBtn('Sign In →', false);
};

// ── LOGOUT ────────────────────────────────────────────────────
window.handleLogout = async function() {
  await window.sb.auth.signOut();
  window.currentUser    = null;
  window.currentProfile = null;
  sessionStorage.removeItem('ue_sp_shown');
  window.updateNavUI();
  window.toast('Signed out.');
  if (!window.location.pathname.endsWith('index.html') && window.location.pathname !== '/') {
    window.location.href = '/index.html';
  }
};

// ── Page load tracking ────────────────────────────────────────
function trackPageLoad() {
  const page = window.location.pathname.split('/').pop() || 'index.html';
  window.trackAction('page_view', { page });
  const t0 = Date.now();
  window.addEventListener('beforeunload', () => {
    window.trackAction('time_on_page', { page, seconds: Math.round((Date.now()-t0)/1000) });
  });
}

// ── INIT ──────────────────────────────────────────────────────
async function initAuth() {
  const { data: { session } } = await window.sb.auth.getSession();

  if (session?.user) {
    window.currentUser = session.user;
    await window.loadProfile();
    window.updateNavUI();
    await window.checkAccess();
    window.showStudyPlanWelcome();
    trackPageLoad();
  } else {
    window.updateNavUI();
  }

  window.sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user) {
      window.currentUser = session.user;
      await window.loadProfile();
      window.updateNavUI();
      await window.checkAccess();
      window.showStudyPlanWelcome();
      trackPageLoad();
    } else if (event === 'SIGNED_OUT') {
      window.currentUser    = null;
      window.currentProfile = null;
      window.updateNavUI();
    }
  });
}

// ── Bootstrap on DOMContentLoaded ────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  waitForSB(initAuth);

  // Logout button
  document.addEventListener('click', e => {
    if (e.target.id === 'nav-logout-btn') window.handleLogout();
    // Close modal on backdrop click
    if (e.target.classList.contains('modal-backdrop')) e.target.classList.remove('active');
    if (e.target.classList.contains('sp-modal')) e.target.classList.remove('active');
  });

  // Study plan close
  const spClose = document.getElementById('sp-close-btn');
  if (spClose) spClose.addEventListener('click', () => {
    document.getElementById('study-plan-modal')?.classList.remove('active');
  });

  // Populate exam month dropdowns (signup-exam-date may be on multiple pages)
  document.querySelectorAll('#signup-exam-date').forEach(sel => {
    if (sel.options.length > 1) return;
    const months = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];
    const now    = new Date();
    for (let i = 1; i <= 18; i++) {
      const d   = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const val = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = months[d.getMonth()] + ' ' + d.getFullYear();
      sel.appendChild(opt);
    }
  });
});
