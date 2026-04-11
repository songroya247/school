// ============================================================
// UltimateEdge School — /js/auth.js  (v3.1)
// Foundation script. Load AFTER Supabase CDN, BEFORE all others.
// Exposes: sb, currentUser, currentProfile, toast(), addXP(),
//          trackAction(), openAuthModal(), closeAuthModal()
// ============================================================

const SUPA_URL = 'https://hmfbterdmgoumeeiatji.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtZmJ0ZXJkbWdvdW1lZWlhdGppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3NTAyNzYsImV4cCI6MjA5MTMyNjI3Nn0.JxC-FN5BtBf0keNPqZq8IF-q6A7LMnGoUTkrF3GyEm8';

// Canonical topic list — 20 topics seeded at signup
const UE_TOPICS = [
  // Mathematics
  'quadratics', 'logarithms', 'number-bases', 'differentiation', 'integration',
  // Physics
  'motion', 'electricity', 'waves', 'optics', 'atomic-physics',
  // English
  'comprehension', 'lexis-structure', 'oral-english', 'summary', 'essay',
  // Chemistry
  'organic-chem', 'stoichiometry', 'periodic-table', 'electrolysis', 'acids-bases'
];

// ── Global state ──────────────────────────────────────────────
let sb            = null;   // Supabase client (shared by all scripts)
let currentUser   = null;   // auth.users row
let currentProfile = null;  // profiles row

// ── Wait for Supabase CDN then init ──────────────────────────
function waitForSB(cb) {
  if (typeof supabase !== 'undefined' && supabase.createClient) {
    sb = supabase.createClient(SUPA_URL, SUPA_KEY);
    cb();
  } else {
    setTimeout(() => waitForSB(cb), 50);
  }
}

// ── Toast notification ────────────────────────────────────────
function toast(msg, duration = 3500) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), duration);
}

// ── Award XP ─────────────────────────────────────────────────
async function addXP(n, reason = '') {
  if (!currentUser || !sb) return;
  const newXP = (currentProfile?.total_xp || 0) + n;
  await sb.from('profiles').update({ total_xp: newXP }).eq('id', currentUser.id);
  if (currentProfile) currentProfile.total_xp = newXP;
  const xpEl = document.getElementById('nav-xp');
  if (xpEl) xpEl.textContent = newXP + ' XP';
  if (reason) trackAction('xp_awarded', { amount: n, reason });
}

// ── Commitment tracking ───────────────────────────────────────
async function trackAction(action, meta = {}) {
  if (!currentUser || !sb) return;
  const entry = { action, meta, ts: new Date().toISOString() };
  try {
    await sb.rpc('append_usage_log', { p_user_id: currentUser.id, p_entry: entry });
  } catch (e) {
    // Non-blocking — tracking failure should never break the UX
    console.warn('trackAction failed:', e.message);
  }
}

// ── Load profile from DB ──────────────────────────────────────
async function loadProfile() {
  if (!currentUser || !sb) return;
  const { data, error } = await sb
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();
  if (!error && data) {
    currentProfile = data;
  }
}

// ── Update nav UI ─────────────────────────────────────────────
function updateNavUI() {
  const loginBtn  = document.getElementById('nav-login-btn');
  const logoutBtn = document.getElementById('nav-logout-btn');
  const userPill  = document.getElementById('nav-user-pill');
  const avatar    = document.getElementById('nav-avatar');
  const userName  = document.getElementById('nav-user-name');
  const proBadge  = document.getElementById('nav-pro-badge');
  const xpEl      = document.getElementById('nav-xp');

  if (currentUser && currentProfile) {
    // Logged-in state
    if (loginBtn)  loginBtn.style.display  = 'none';
    if (logoutBtn) logoutBtn.style.display = 'inline-flex';
    if (userPill)  userPill.style.display  = 'flex';

    const firstName = (currentProfile.full_name || '').split(' ')[0];
    const initials  = (currentProfile.full_name || 'U')
      .split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

    if (avatar)   avatar.textContent   = initials;
    if (userName) userName.textContent = firstName;
    if (xpEl)     xpEl.textContent     = (currentProfile.total_xp || 0) + ' XP';

    if (proBadge) {
      if (currentProfile.is_premium) {
        proBadge.textContent    = 'PRO';
        proBadge.style.display  = 'inline-block';
      } else {
        proBadge.style.display  = 'none';
      }
    }
  } else {
    // Logged-out state
    if (loginBtn)  loginBtn.style.display  = 'inline-flex';
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (userPill)  userPill.style.display  = 'none';
  }
}

// ── Subscription expiry guard ─────────────────────────────────
async function checkAccess() {
  if (!currentProfile || !currentProfile.is_premium) return;

  const expiry = currentProfile.subscription_expiry
    ? new Date(currentProfile.subscription_expiry)
    : null;

  if (expiry && new Date() > expiry) {
    // Expired — downgrade in DB
    await sb.from('profiles').update({
      is_premium: false,
      status: 'expired',
      subscription_status: 'EXPIRED'
    }).eq('id', currentUser.id);

    currentProfile.is_premium = false;
    currentProfile.status     = 'expired';

    // Show red defaulter banner
    const banner = document.getElementById('defaulter-banner');
    if (banner) banner.classList.add('active');

    // Redirect protected pages
    const protectedPages = ['classroom.html', 'cbt.html', 'dashboard.html'];
    const isProtected = protectedPages.some(p => window.location.pathname.includes(p));
    if (isProtected) {
      toast('Your subscription has expired. Redirecting…');
      setTimeout(() => {
        window.location.href = '/index.html#pricing';
      }, 2500);
    }
  }
}

// ── Study Plan Welcome Modal ──────────────────────────────────
function showStudyPlanWelcome() {
  if (!currentProfile) return;
  if (sessionStorage.getItem('ue_study_plan_shown')) return;
  sessionStorage.setItem('ue_study_plan_shown', '1');

  const modal = document.getElementById('study-plan-modal');
  if (!modal) return;

  // Months to exam
  let monthsText = '—';
  if (currentProfile.exam_date) {
    const diff = Math.ceil(
      (new Date(currentProfile.exam_date) - new Date()) / (1000 * 60 * 60 * 24 * 30)
    );
    monthsText = diff > 0 ? diff + ' month' + (diff === 1 ? '' : 's') : 'Very soon!';
  }

  // Readiness
  const isNil        = currentProfile.accuracy_avg == null;
  const readiness    = isNil
    ? '<span class="status-nil">NIL — take your first drill</span>'
    : Math.round(currentProfile.accuracy_avg) + '% accuracy';

  // Study intensity based on months left
  const months = parseInt(monthsText) || 99;
  let intensity = '4–5 sessions/week';
  if      (months <= 1) intensity = '2–3 sessions/day';
  else if (months <= 3) intensity = '1 session/day';

  // Grade description
  const gradeDesc = {
    1: 'Foundational level — building strong basics',
    2: 'Intermediate level — more examples & practice',
    3: 'Standard level — exam-ready materials'
  };
  const grade     = currentProfile.current_skill_level || 3;
  const gradeText = gradeDesc[grade] || gradeDesc[3];

  // Exams
  const exams = (currentProfile.exam_types || []).join(', ') || 'Not set';

  // Populate modal
  document.getElementById('sp-months').textContent     = monthsText;
  document.getElementById('sp-readiness').innerHTML    = readiness;
  document.getElementById('sp-intensity').textContent  = intensity;
  document.getElementById('sp-grade').textContent      = gradeText;
  document.getElementById('sp-exams').textContent      = exams;

  modal.classList.add('active');
}

// ── Auth modal helpers ────────────────────────────────────────
function openAuthModal(tab = 'login') {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.classList.add('active');
  switchAuthTab(tab);
}

function closeAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.classList.remove('active');
}

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.auth-tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.dataset.pane === tab);
  });
}

// ── Add/Change Exams Modal ────────────────────────────────────
function openAddExamModal() {
  const modal = document.getElementById('add-exam-modal');
  if (!modal || !currentProfile) return;

  // Pre-tick existing exams
  const current = currentProfile.exam_types || [];
  modal.querySelectorAll('.exam-checkbox').forEach(cb => {
    cb.checked = current.includes(cb.value);
  });
  modal.classList.add('active');
}

async function saveExamChanges() {
  const modal    = document.getElementById('add-exam-modal');
  const checked  = [...document.querySelectorAll('.exam-checkbox:checked')].map(cb => cb.value);
  if (!checked.length) { toast('Please select at least one exam'); return; }

  const { error } = await sb.from('profiles')
    .update({ exam_types: checked })
    .eq('id', currentUser.id);

  if (error) { toast('Error saving. Try again.'); return; }
  currentProfile.exam_types = checked;
  toast('Exam list updated!');
  if (modal) modal.classList.remove('active');
}

// ── SIGNUP ────────────────────────────────────────────────────
async function handleSignup(e) {
  e.preventDefault();
  const btn  = document.getElementById('signup-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Creating account…'; }

  const name       = document.getElementById('signup-name')?.value?.trim();
  const email      = document.getElementById('signup-email')?.value?.trim();
  const password   = document.getElementById('signup-password')?.value;
  const examDate   = document.getElementById('signup-exam-date')?.value;
  const targetScore = parseInt(document.getElementById('signup-target')?.value) || 250;
  const examTypes  = [...document.querySelectorAll('.signup-exam-check:checked')]
    .map(cb => cb.value);

  // Validation
  if (!name)               { toast('Please enter your full name'); reset(); return; }
  if (!email)              { toast('Please enter your email'); reset(); return; }
  if (!password || password.length < 8) { toast('Password must be at least 8 characters'); reset(); return; }
  if (!examTypes.length)   { toast('Please select at least one exam'); reset(); return; }
  if (!examDate)           { toast('Please select your exam month'); reset(); return; }

  // Supabase Auth signup
  const { data: authData, error: authError } = await sb.auth.signUp({
    email,
    password,
    options: { data: { full_name: name } }
  });

  if (authError) {
    toast(authError.message);
    reset();
    return;
  }

  const userId = authData.user?.id;
  if (!userId) { toast('Signup failed. Please try again.'); reset(); return; }

  // Insert into profiles
  const { error: profileError } = await sb.from('profiles').insert({
    id:                   userId,
    full_name:            name,
    email:                email,
    exam_types:           examTypes,
    exam_date:            examDate + '-01',     // First of the chosen month
    target_score:         targetScore,
    current_skill_level:  3,
    is_premium:           false,
    accuracy_avg:         null,                 // NIL state
    mastery_level:        null,                 // NIL state
    status:               'NIL',
    total_xp:             0,
    usage_logs:           []
  });

  if (profileError) {
    console.error('Profile insert error:', profileError);
    // Non-fatal — user exists, profile can be fixed
  }

  // Seed 20 topic_mastery rows (all NIL)
  const topicRows = UE_TOPICS.map(topicId => ({
    user_id:           userId,
    topic_id:          topicId,
    accuracy_avg:      null,
    mastery_level:     null,
    status:            'NIL',
    grade_level:       3,
    attempts_at_grade1: 0
  }));

  const { error: topicError } = await sb.from('topic_mastery').insert(topicRows);
  if (topicError) console.error('Topic mastery seed error:', topicError);

  toast('Account created! Check your email to verify.');
  closeAuthModal();

  function reset() {
    if (btn) { btn.disabled = false; btn.textContent = 'Create Free Account →'; }
  }
  reset();
}

// ── LOGIN ─────────────────────────────────────────────────────
async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('login-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Signing in…'; }

  const email    = document.getElementById('login-email')?.value?.trim();
  const password = document.getElementById('login-password')?.value;

  if (!email || !password) {
    toast('Please fill in email and password');
    reset();
    return;
  }

  const { error } = await sb.auth.signInWithPassword({ email, password });

  if (error) {
    toast(error.message === 'Email not confirmed'
      ? 'Please verify your email first. Check your inbox.'
      : 'Login failed: ' + error.message);
    reset();
    return;
  }

  closeAuthModal();
  toast('Welcome back!');

  function reset() {
    if (btn) { btn.disabled = false; btn.textContent = 'Sign In →'; }
  }
  reset();
}

// ── LOGOUT ────────────────────────────────────────────────────
async function handleLogout() {
  await sb.auth.signOut();
  currentUser    = null;
  currentProfile = null;
  sessionStorage.removeItem('ue_study_plan_shown');
  updateNavUI();
  toast('Signed out.');
  if (!window.location.pathname.includes('index')) {
    window.location.href = '/index.html';
  }
}

// ── Page load commitment tracking ─────────────────────────────
function trackPageLoad() {
  const page = window.location.pathname.split('/').pop() || 'index.html';
  trackAction('page_view', { page });

  // Track time on page
  const startTime = Date.now();
  window.addEventListener('beforeunload', () => {
    const seconds = Math.round((Date.now() - startTime) / 1000);
    trackAction('time_on_page', { page, seconds });
  });
}

// ── INIT ──────────────────────────────────────────────────────
async function initAuth() {
  const { data: { session } } = await sb.auth.getSession();

  if (session?.user) {
    currentUser = session.user;
    await loadProfile();
    updateNavUI();
    await checkAccess();
    showStudyPlanWelcome();
    trackPageLoad();
  } else {
    updateNavUI();
  }

  // Listen for auth state changes (login, logout, token refresh)
  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user) {
      currentUser = session.user;
      await loadProfile();
      updateNavUI();
      await checkAccess();
      showStudyPlanWelcome();
      trackPageLoad();
    } else if (event === 'SIGNED_OUT') {
      currentUser    = null;
      currentProfile = null;
      updateNavUI();
    }
  });
}

// ── Bootstrap ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  waitForSB(initAuth);

  // Wire logout button
  const logoutBtn = document.getElementById('nav-logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

  // Close modals on backdrop click
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop')) {
      e.target.classList.remove('active');
    }
  });

  // Close study plan modal
  const spClose = document.getElementById('sp-close-btn');
  if (spClose) spClose.addEventListener('click', () => {
    document.getElementById('study-plan-modal')?.classList.remove('active');
  });
});
