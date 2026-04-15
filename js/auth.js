/* ═══════════════════════════════════════════════════════════
   UE School — auth.js  v4.1
   Foundation script. Runs on every page.
   Sets globals: sb, currentUser, currentProfile, toast(),
   addXP(), trackAction(), openAuthModal(), getStudyMode(),
   setStudyMode(), getExamSubjects()
   ═══════════════════════════════════════════════════════════ */

/* ── SUPABASE CLIENT ── */
const SUPA_URL = 'https://hazwqyvnolgdkokehjhr.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhendxeXZub2xnZGtva2VoamhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMDUwNzYsImV4cCI6MjA5MTY4MTA3Nn0.V7TsNcfpib2HtJRjTASyJPavQ8qUR2R4KXYuWdZB4gE';

/* Wait for Supabase CDN to load */
function waitForSB(cb, attempts = 0) {
  if (window.supabase) { cb(); return; }
  if (attempts > 30) { console.error('Supabase CDN failed to load'); return; }
  setTimeout(() => waitForSB(cb, attempts + 1), 100);
}

/* ── GLOBALS ── */
let sb, currentUser = null, currentProfile = null;

/* ── PROTECTED PAGES ── */
const PROTECTED_PAGES = ['dashboard.html', 'classroom.html', 'cbt.html', 'report-view.html'];

function guardPage() {
  const page = location.pathname.split('/').pop() || 'index.html';
  if (PROTECTED_PAGES.some(p => page.includes(p))) {
    window.location.replace('/index.html?auth=login');
  }
}

/* ── SUBJECTS MASTER LIST ── */
const SUBJECTS_META = {
  mathematics: { name: 'Mathematics',         icon: '📐', color: '#1a56ff' },
  english:     { name: 'English Language',     icon: '📖', color: '#00c97a' },
  physics:     { name: 'Physics',              icon: '⚛️',  color: '#7c3aed' },
  chemistry:   { name: 'Chemistry',            icon: '🧪', color: '#ff6b35' },
  biology:     { name: 'Biology',              icon: '🌿', color: '#0891b2' },
  economics:   { name: 'Economics',            icon: '📈', color: '#f59e0b' },
  government:  { name: 'Government',           icon: '🏛️',  color: '#6366f1' },
  literature:  { name: 'Literature in English',icon: '📚', color: '#ec4899' },
  geography:   { name: 'Geography',            icon: '🌍', color: '#10b981' },
  commerce:    { name: 'Commerce',             icon: '🏪', color: '#8b5cf6' },
  accounts:    { name: 'Financial Accounting', icon: '💼', color: '#14b8a6' },
};

/* Topic seeds per subject (a sample set — expand as questions are added) */
const TOPIC_SEEDS = {
  mathematics: ['quadratics','indices','logarithms','calculus','probability','statistics','geometry','trigonometry','algebra','arithmetic'],
  english:     ['comprehension','essay-writing','summary','vocabulary','oral-english','register','figures-of-speech'],
  physics:     ['mechanics','waves','electricity','magnetism','optics','thermodynamics','modern-physics'],
  chemistry:   ['organic-chem','periodic-table','bonding','acids-bases','equilibrium','electrochemistry','organic-reactions'],
  biology:     ['cell-biology','genetics','ecology','reproduction','nutrition','transport','evolution'],
  economics:   ['demand-supply','national-income','money-banking','public-finance','international-trade','development-economics'],
  government:  ['constitution','legislature','executive','judiciary','federalism','electoral-process','international-relations'],
  literature:  ['prose','drama','poetry','oral-literature','literary-devices'],
  geography:   ['physical-geography','human-geography','map-work','climate','population','resources'],
  commerce:    ['trade','communication','insurance','banking','warehousing','transport'],
  accounts:    ['bookkeeping','final-accounts','ratio-analysis','cash-flow','partnership','company-accounts'],
};

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', () => {
  waitForSB(async () => {
    sb = window.supabase.createClient(SUPA_URL, SUPA_KEY);
    await initAuth();

    /* Listen for auth state changes */
    sb.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        currentUser = session.user;
        await loadProfile();
        updateNavUI();
        await checkAccess();
        showStudyPlanWelcome();
      } else if (event === 'SIGNED_OUT') {
        currentUser = null;
        currentProfile = null;
        updateNavUI();
      }
    });
  });
});

async function initAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    currentUser = session.user;
    await loadProfile();
    updateNavUI();
    await checkAccess();
    showStudyPlanWelcome();
  } else {
    updateNavUI();
    guardPage();
  }
  trackPageLoad();
}

/* ── LOAD PROFILE ── */
async function loadProfile() {
  if (!currentUser) return;
  const { data, error } = await sb
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();
  if (error) { console.error('loadProfile:', error); return; }
  currentProfile = data;
}

/* ── UPDATE NAV UI ── */
function updateNavUI() {
  const loginBtn = document.getElementById('nav-login-btn');
  const userPill = document.getElementById('nav-user-pill');

  if (currentProfile) {
    /* Show user pill, hide login button */
    if (loginBtn) loginBtn.style.display = 'none';
    if (userPill) {
      userPill.style.display = 'flex';
      const initials = currentProfile.full_name
        ? currentProfile.full_name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase()
        : '??';
      const avatarEl = document.getElementById('nav-avatar-initials');
      if (avatarEl) avatarEl.textContent = initials;
      const nameEl = document.getElementById('nav-user-name');
      if (nameEl) nameEl.textContent = currentProfile.full_name.split(' ')[0];
      const xpEl = document.getElementById('nav-xp');
      if (xpEl) xpEl.textContent = `${currentProfile.total_xp ?? 0} XP`;
      const proEl = document.getElementById('nav-pro-badge');
      if (proEl) proEl.style.display = currentProfile.is_premium ? 'flex' : 'none';
    }
  } else {
    if (loginBtn) loginBtn.style.display = '';
    if (userPill) userPill.style.display = 'none';
  }
}

/* ── CHECK SUBSCRIPTION ACCESS ── */
async function checkAccess() {
  if (!currentProfile) return;
  const { is_premium, subscription_expiry } = currentProfile;
  if (is_premium && subscription_expiry && new Date() > new Date(subscription_expiry)) {
    /* Expired — downgrade */
    await sb.from('profiles').update({ is_premium: false }).eq('id', currentUser.id);
    currentProfile.is_premium = false;
    const banner = document.getElementById('defaulter-banner');
    if (banner) banner.style.display = 'block';
    /* Redirect classroom/CBT to pricing */
    const page = location.pathname;
    if (page.includes('classroom') || page.includes('cbt')) {
      window.location.href = '/index.html#pricing';
    }
  }
}

/* ── STUDY PLAN WELCOME MODAL ── */
function showStudyPlanWelcome() {
  if (!currentProfile) return;
  /* Only once per browser session */
  if (sessionStorage.getItem('sp_shown')) return;
  sessionStorage.setItem('sp_shown', '1');

  const modal = document.getElementById('sp-modal');
  if (!modal) return;

  const monthsToExam = currentProfile.exam_date
    ? Math.max(0, Math.round((new Date(currentProfile.exam_date) - Date.now()) / (1000 * 60 * 60 * 24 * 30)))
    : null;

  /* Grade language — never show "Grade 1/2/3" */
  const gradeLanguage = {
    3: "You're at exam-ready level 💪",
    2: "You're building strong foundations",
    1: "You're in focused reinforcement mode — keep going",
  }[currentProfile.current_skill_level] || "Keep practising!";

  /* Study intensity */
  let intensity = '4–5 sessions/week';
  if (monthsToExam !== null) {
    if (monthsToExam <= 1) intensity = '2–3 sessions/day';
    else if (monthsToExam <= 3) intensity = '1 session/day';
  }

  /* Populate modal */
  const el = id => document.getElementById(id);
  const set = (i, v) => { const e = el(i); if (e) e.textContent = v; };
  set('sp-name', currentProfile.full_name?.split(' ')[0] || 'Student');
  set('sp-months', monthsToExam !== null ? `${monthsToExam} month${monthsToExam !== 1 ? 's' : ''} to exam` : 'Exam date not set');
  set('sp-readiness', currentProfile.accuracy_avg !== null && currentProfile.accuracy_avg !== undefined ? `${Math.round(currentProfile.accuracy_avg)}% accuracy` : 'NIL — take your first session');
  set('sp-grade-msg', gradeLanguage);
  set('sp-intensity', intensity);

  /* SmartPath suggestion */
  const queue = currentProfile.smartpath_queue || [];
  set('sp-smartpath', queue.length > 0 ? `Start with: ${queue[0].topicId || queue[0]}` : 'Complete your first session to unlock recommendations');

  modal.classList.add('open');
}

/* ── AUTH MODAL CONTROL ── */
function openAuthModal(tab = 'signup') {
  const modal = document.getElementById('auth-modal');
  if (!modal) return;
  modal.classList.add('open');
  switchAuthTab(tab);
}

function closeAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.classList.remove('open');
  const spModal = document.getElementById('sp-modal');
  if (spModal) spModal.classList.remove('open');
}

function switchAuthTab(tab) {
  const loginForm  = document.getElementById('auth-login-form');
  const signupForm = document.getElementById('auth-signup-form');
  const tabLogin   = document.getElementById('auth-tab-login');
  const tabSignup  = document.getElementById('auth-tab-signup');
  if (!loginForm) return;
  loginForm.style.display  = tab === 'login'  ? 'block' : 'none';
  signupForm.style.display = tab === 'signup' ? 'block' : 'none';
  tabLogin?.classList.toggle('active',  tab === 'login');
  tabSignup?.classList.toggle('active', tab === 'signup');
}

/* ── SIGNUP: MULTI-STEP STATE ── */
let _jambSelected = false;
const _selectedSubjects = new Set();
let _currentStep = 1;

function goSignupStep(n) {
  /* Validate before advancing */
  if (n > _currentStep) {
    if (_currentStep === 1) {
      const name  = document.getElementById('su-name')?.value.trim();
      const email = document.getElementById('su-email')?.value.trim();
      const pass  = document.getElementById('su-pass')?.value;
      if (!name || !email || !pass || pass.length < 8) {
        toast('Please fill all fields (password: min 8 characters)'); return;
      }
    }
    if (_currentStep === 2) {
      const exams = document.querySelectorAll('.exam-check-label input:checked');
      if (!exams.length) { toast('Please select at least one exam'); return; }
      const date = document.getElementById('su-date')?.value;
      if (!date) { toast('Please select your exam date'); return; }
    }
    if (_currentStep === 3) {
      if (_selectedSubjects.size === 0) { toast('Please select at least one subject'); return; }
    }
  }
  _currentStep = n;
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById(`su-step-${i}`);
    if (el) el.style.display = i === n ? 'block' : 'none';
  }
}

function toggleSignupSubj(el, id) {
  el.classList.toggle('selected');
  if (el.classList.contains('selected')) _selectedSubjects.add(id);
  else _selectedSubjects.delete(id);
  updateJAMBHint();
}

function checkJAMBExam() {
  const checked = document.querySelectorAll('.exam-checks input:checked');
  _jambSelected = Array.from(checked).some(c => c.value === 'JAMB');
  updateJAMBHint();
}

function updateJAMBHint() {
  const hint    = document.getElementById('su-jamb-hint');
  const countEl = document.getElementById('su-jamb-count');
  if (!hint) return;
  if (_jambSelected) {
    hint.style.display = 'block';
    if (countEl) countEl.textContent = _selectedSubjects.size;
    hint.classList.toggle('ok', _selectedSubjects.size === 4);
  } else {
    hint.style.display = 'none';
  }
}

/* ── HANDLE SIGNUP ── */
async function handleSignup(event) {
  event?.preventDefault();
  const btn = document.getElementById('su-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Creating account…'; }

  const name    = document.getElementById('su-name')?.value.trim();
  const email   = document.getElementById('su-email')?.value.trim();
  const pass    = document.getElementById('su-pass')?.value;
  const dateVal = document.getElementById('su-date')?.value;
  const target  = parseInt(document.getElementById('su-target')?.value) || 250;
  const mode    = document.querySelector('input[name=study_mode]:checked')?.value || 'drill';
  const exams   = Array.from(document.querySelectorAll('.exam-check-label input:checked')).map(c => c.value);
  const subjects = Array.from(_selectedSubjects);

  /* Parse exam date */
  let examDate = null;
  if (dateVal) {
    const parts = dateVal.split(' ');
    const months = { January:1,February:2,March:3,April:4,May:5,June:6,July:7,August:8,September:9,October:10,November:11,December:12 };
    if (parts.length === 2) examDate = `${parts[1]}-${String(months[parts[0]]).padStart(2,'0')}-01`;
  }

  try {
    /* 1. Create auth user */
    const { data: authData, error: authErr } = await sb.auth.signUp({ email, password: pass });
    if (authErr) throw authErr;
    const uid = authData.user.id;

    /* 2. Insert profile row */
    const { error: profErr } = await sb.from('profiles').insert({
      id: uid,
      full_name: name,
      email,
      exam_types: exams,
      exam_date: examDate,
      target_score: target,
      exam_subjects: subjects,
      study_mode: mode,
      status: 'NIL',
    });
    if (profErr) throw profErr;

    /* 3. Seed topic_mastery rows for selected subjects only */
    const seeds = subjects.flatMap(subj =>
      (TOPIC_SEEDS[subj] || []).map(topicId => ({
        user_id: uid, topic_id: topicId, status: 'NIL',
        accuracy_avg: null, mastery_level: null, grade_level: 3,
      }))
    );
    if (seeds.length) {
      const { error: seedErr } = await sb.from('topic_mastery').insert(seeds);
      if (seedErr) console.warn('Seed error (non-fatal):', seedErr);
    }

    toast('Account created! Check your email to verify. ✉️');
    closeAuthModal();
    setTimeout(() => window.location.href = '/dashboard.html', 2000);
  } catch (err) {
    toast(`Error: ${err.message}`);
    if (btn) { btn.disabled = false; btn.textContent = 'Create Account'; }
  }
}


/* ── HANDLE FORGOT PASSWORD ── */
async function handleForgotPassword(event) {
  event?.preventDefault();
  const emailEl = document.getElementById('login-email');
  const email = emailEl?.value.trim();
  if (!email) {
    toast('Please enter your email address first.');
    emailEl?.focus();
    return;
  }
  const link = event?.currentTarget;
  if (link) { link.textContent = 'Sending…'; link.style.pointerEvents = 'none'; }
  try {
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/index.html?auth=reset'
    });
    if (error) throw error;
    toast('✅ Password reset link sent! Check your inbox (and spam folder).');
  } catch (err) {
    toast('Error: ' + err.message);
  } finally {
    if (link) { link.textContent = 'Forgot Password?'; link.style.pointerEvents = ''; }
  }
}

/* ── HANDLE LOGIN ── */
async function handleLogin(event) {
  event?.preventDefault();
  const btn   = document.getElementById('login-submit-btn');
  const email = document.getElementById('login-email')?.value.trim();
  const pass  = document.getElementById('login-password')?.value;
  if (!email || !pass) { toast('Please fill in all fields'); return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Logging in…'; }

  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  if (error) {
    toast(`Login failed: ${error.message}`);
    if (btn) { btn.disabled = false; btn.textContent = 'Login'; }
  } else {
    toast('Welcome back! 🎉');
    closeAuthModal();
    setTimeout(() => window.location.href = '/dashboard.html', 1000);
  }
}

/* ── OPEN "UPDATE EXAM" MODAL ── */
function openAddExamModal() {
  toast('Exam update coming soon');
}

/* ── LOGOUT ── */
async function logout() {
  await sb.auth.signOut();
  window.location.href = '/index.html';
}

/* ── STUDY MODE ── */
function getStudyMode() {
  return currentProfile?.study_mode || 'drill';
}

async function setStudyMode(mode) {
  if (!currentUser) return;
  await sb.from('profiles').update({ study_mode: mode }).eq('id', currentUser.id);
  if (currentProfile) currentProfile.study_mode = mode;
  toast(`Study mode updated: ${mode === 'cbt_only' ? 'CBT Only' : 'Drill + Video'}`);
}

/* ── EXAM SUBJECTS ── */
function getExamSubjects() {
  return currentProfile?.exam_subjects || [];
}

/* ── TOAST ── */
function toast(msg, duration = 3200) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), duration);
}

/* ── ADD XP ── */
async function addXP(n, reason = '') {
  if (!currentUser || !currentProfile) return;
  const newXP = (currentProfile.total_xp || 0) + n;
  await sb.from('profiles').update({ total_xp: newXP }).eq('id', currentUser.id);
  currentProfile.total_xp = newXP;
  const xpEl = document.getElementById('nav-xp');
  if (xpEl) xpEl.textContent = `${newXP} XP`;
  if (n > 0) toast(`+${n} XP ${reason}`);
}

/* ── TRACK ACTION ── */
async function trackAction(action, meta = {}) {
  if (!currentUser) return;
  const entry = { action, meta, ts: new Date().toISOString() };
  /* Call the Supabase DB function that safely appends to usage_logs */
  await sb.rpc('append_usage_log', { uid: currentUser.id, entry });
  if (currentProfile) {
    currentProfile.usage_logs = [...(currentProfile.usage_logs || []), entry];
  }
}

function trackPageLoad() {
  const page = location.pathname.split('/').pop() || 'index.html';
  trackAction('page_load', { page });
  /* Nav active state */
  document.querySelectorAll('.nav-links a').forEach(a => {
    const href = a.getAttribute('href') || '';
    a.classList.toggle('active', href.includes(page) && page !== 'index.html');
  });
}
