/* ================================================================
   auth.js — UltimateEdge v2.1
   Supabase auth, session management, checkAccess() defaulter guard,
   XP helpers, streak tracking. Include after supabase-js CDN.
   ================================================================ */

const SUPA_URL = 'https://hmfbterdmgoumeeiatji.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtZmJ0ZXJkbWdvdW1lZWlhdGppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3NTAyNzYsImV4cCI6MjA5MTMyNjI3Nn0.JxC-FN5BtBf0keNPqZq8IF-q6A7LMnGoUTkrF3GyEm8';

let sb, currentUser, currentProfile;

/* ── INIT ── */
function waitForSB(cb) {
  if (typeof window.supabase !== 'undefined') { sb = window.supabase.createClient(SUPA_URL, SUPA_KEY); cb(); }
  else setTimeout(() => waitForSB(cb), 80);
}

async function initAuth() {
  waitForSB(async () => {
    const { data: { session } } = await sb.auth.getSession();
    currentUser = session?.user ?? null;
    if (currentUser) await loadProfile();
    updateNavUI();
    await checkAccess();

    sb.auth.onAuthStateChange(async (_e, session) => {
      currentUser = session?.user ?? null;
      if (currentUser) await loadProfile();
      else currentProfile = null;
      updateNavUI();
    });
  });
}

async function loadProfile() {
  const { data } = await sb.from('profiles').select('*').eq('id', currentUser.id).single();
  currentProfile = data;
}

/* ── DEFAULTER GUARD (runs on every page load) ── */
async function checkAccess() {
  if (!currentUser || !currentProfile) return;
  if (!currentProfile.is_premium) return; // free user — nothing to check

  const now = new Date();
  const expiry = currentProfile.subscription_expiry ? new Date(currentProfile.subscription_expiry) : null;

  if (expiry && now > expiry) {
    await restrictAccess();
  }
}

async function restrictAccess() {
  // 1. Update database
  await sb.from('profiles').update({
    is_premium: false,
    subscription_status: 'expired'
  }).eq('id', currentUser.id);

  currentProfile = { ...currentProfile, is_premium: false, subscription_status: 'expired' };
  updateNavUI();

  // 2. Visual lockdown
  const banner = document.getElementById('defaulter-banner');
  if (banner) banner.classList.add('show');

  const path = window.location.pathname;
  if (path.includes('classroom') || path.includes('cbt') || path.includes('dashboard')) {
    const proceed = confirm('Your subscription has expired.\n\nYour free access is still active.\nClick OK to renew access for full content.');
    if (proceed) window.location.href = 'index.html#pricing';
  }
}

/* ── NAV UI ── */
function updateNavUI() {
  const pill      = document.getElementById('nav-user-pill');
  const loginBtn  = document.getElementById('nav-login-btn');
  const logoutBtn = document.getElementById('nav-logout-btn');
  const proBadge  = document.getElementById('nav-pro-badge');
  const xpEl      = document.getElementById('nav-xp');
  const avatar    = document.getElementById('nav-avatar');

  if (!pill) return;

  if (currentUser && currentProfile) {
    const name = currentProfile.full_name || currentUser.email;
    if (avatar) avatar.textContent = name.charAt(0).toUpperCase();
    const nameEl = document.getElementById('nav-user-name');
    if (nameEl) nameEl.textContent = name.split(' ')[0];
    pill.classList.add('show');
    if (loginBtn)  loginBtn.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'inline-flex';
    if (proBadge)  proBadge.style.display  = currentProfile.is_premium ? 'inline' : 'none';
    if (xpEl)      xpEl.textContent        = (currentProfile.total_xp || 0) + ' XP';
  } else {
    pill.classList.remove('show');
    if (loginBtn)  loginBtn.style.display  = 'inline-flex';
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (proBadge)  proBadge.style.display  = 'none';
  }
}

/* ── AUTH ACTIONS ── */
function openAuthModal(tab = 'login') {
  const el = document.getElementById('auth-modal');
  if (el) { el.classList.add('open'); switchAuthTab(tab); }
}
function closeAuthModal() {
  const el = document.getElementById('auth-modal');
  if (el) el.classList.remove('open');
}
function switchAuthTab(t) {
  ['login','signup'].forEach(id => {
    const form = document.getElementById(id + '-form');
    const btn  = document.getElementById('tab-' + id);
    if (form) form.style.display = t === id ? 'block' : 'none';
    if (btn)  btn.classList.toggle('active', t === id);
  });
  const title = document.getElementById('modal-title');
  if (title) title.textContent = t === 'login' ? 'Welcome Back' : 'Create Free Account';
  clearAuthMsg();
}
function clearAuthMsg() {
  ['auth-error','auth-success'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.classList.remove('visible'); el.textContent = ''; }
  });
}
function showAuthMsg(type, msg) {
  clearAuthMsg();
  const el = document.getElementById('auth-' + type);
  if (el) { el.textContent = msg; el.classList.add('visible'); }
}

const SYLLABUS_TOPICS = [
  'quadratics','algebra','trigonometry','calculus','statistics','geometry',
  'mechanics','waves','electricity','optics','thermodynamics',
  'comprehension','lexis','oral-english','grammar'
];

async function handleLogin() {
  const email = document.getElementById('l-email')?.value.trim();
  const pass  = document.getElementById('l-pass')?.value;
  if (!email || !pass) { showAuthMsg('error', 'Please fill in all fields.'); return; }
  showAuthMsg('success', 'Logging in…');
  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  if (error) { showAuthMsg('error', error.message); return; }
  showAuthMsg('success', 'Logged in! ✅');
  setTimeout(closeAuthModal, 900);
  toast('Welcome back! 👋');
}

async function handleSignup() {
  const name   = document.getElementById('s-name')?.value.trim();
  const email  = document.getElementById('s-email')?.value.trim();
  const pass   = document.getElementById('s-pass')?.value;
  const target = parseInt(document.getElementById('s-target')?.value) || 280;
  const exams  = [];
  document.querySelectorAll('.exam-checkbox:checked').forEach(c => exams.push(c.value));

  if (!name || !email || !pass) { showAuthMsg('error', 'Please fill in all fields.'); return; }
  if (pass.length < 6) { showAuthMsg('error', 'Password must be at least 6 characters.'); return; }
  showAuthMsg('success', 'Creating account…');

  const { data, error } = await sb.auth.signUp({ email, password: pass });
  if (error) { showAuthMsg('error', error.message); return; }

  if (data?.user) {
    await sb.from('profiles').insert({
      id: data.user.id, full_name: name,
      is_premium: false, subscription_status: 'inactive',
      target_jamb_score: target,
      exams_focused: exams.length ? exams : ['JAMB','WAEC'],
      current_streak: 0, total_xp: 0, badges: []
    });
    await sb.from('topic_mastery').insert(
      SYLLABUS_TOPICS.map(t => ({
        user_id: data.user.id, topic_id: t,
        accuracy_avg: 0, speed_avg: 0, questions_solved: 0, mastery_level: 0
      }))
    );
  }
  showAuthMsg('success', 'Account created! Check your email to verify.');
  toast('Account created ✅');
}

async function handleLogout() {
  await sb.auth.signOut();
  toast('Logged out 👋');
  currentUser = null; currentProfile = null;
  updateNavUI();
}

/* ── XP HELPERS ── */
async function addXP(amount, reason = '') {
  if (!currentUser || !sb) return;
  const newXP = (currentProfile?.total_xp || 0) + amount;
  await sb.from('profiles').update({ total_xp: newXP }).eq('id', currentUser.id);
  if (currentProfile) currentProfile.total_xp = newXP;
  updateNavUI();
  if (amount > 0) toast(`+${amount} XP ${reason}`);
}

async function updateStreak() {
  if (!currentUser || !currentProfile || !sb) return;
  const last = currentProfile.last_activity ? new Date(currentProfile.last_activity) : null;
  const now  = new Date();
  const diffH = last ? (now - last) / 3600000 : 999;
  let streak = currentProfile.current_streak || 0;
  if (diffH >= 24) streak++; // new day
  await sb.from('profiles').update({ current_streak: streak, last_activity: now.toISOString() }).eq('id', currentUser.id);
  if (currentProfile) { currentProfile.current_streak = streak; currentProfile.last_activity = now.toISOString(); }
}

/* ── TOAST ── */
function toast(msg, ms = 3200) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg; el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), ms);
}

/* ── MOBILE NAV ── */
function toggleMobileMenu() { document.getElementById('nav-mobile')?.classList.toggle('open'); }
function closeMobileMenu()  { document.getElementById('nav-mobile')?.classList.remove('open'); }
document.addEventListener('click', e => {
  const mm = document.getElementById('nav-mobile');
  const bg = document.getElementById('nav-burger');
  if (mm?.classList.contains('open') && !mm.contains(e.target) && !bg?.contains(e.target)) closeMobileMenu();
});

/* ── REVEAL OBSERVER ── */
function initReveal() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach((e, i) => {
      if (e.isIntersecting) {
        setTimeout(() => e.target.classList.add('visible'), i * 80);
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.08 });
  document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
}

document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  initReveal();
  // close modal on backdrop click
  document.getElementById('auth-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('auth-modal')) closeAuthModal();
  });
});
