/* ── UltimateEdge School — auth.js v4.1 ── */
/* Supabase client · session · signup · login · nav · access guard */

// ─── CREDENTIALS ──────────────────────────────────────────────────────────────
const SUPA_URL = 'YOUR_SUPABASE_PROJECT_URL';   // ← replace before deploy
const SUPA_KEY = 'YOUR_SUPABASE_ANON_KEY';      // ← replace before deploy

// ─── GLOBALS (exposed to all other scripts) ───────────────────────────────────
let sb;               // Supabase client
let currentUser;      // auth.users row
let currentProfile;   // profiles row

// ─── TOPIC CURRICULUM MAP ─────────────────────────────────────────────────────
// Used for seeding topic_mastery at signup and filtering by subject
const CURRICULUM = {
  mathematics: ['number-bases','fractions-decimals','indices','logarithms','surds',
                'sets','polynomials','quadratics','simultaneous-equations','inequalities',
                'progression','probability','statistics','vectors','trigonometry',
                'calculus-differentiation','calculus-integration','coordinate-geometry'],
  english:     ['comprehension','summary','lexis-structure','oral-english',
                'essay-writing','letter-writing','narrative-writing','argumentative-writing'],
  physics:     ['measurement','motion','forces','energy','waves','optics','electricity',
                'magnetism','modern-physics','thermal-physics'],
  chemistry:   ['atomic-structure','periodic-table','bonding','stoichiometry',
                'kinetics','equilibrium','organic-intro','organic-reactions',
                'electrochemistry','acids-bases'],
  biology:     ['cell-biology','genetics','evolution','ecology','nutrition',
                'transport','reproduction','excretion','coordination','classification'],
  economics:   ['basic-concepts','demand-supply','price-determination','market-structures',
                'national-income','money-banking','international-trade','development-economics'],
  government:  ['political-concepts','nigerian-constitution','legislature','executive',
                'judiciary','federalism','electoral-systems','international-relations'],
  literature:  ['prose-fiction','drama','poetry','literary-devices',
                'african-literature','shakespearean-texts'],
  geography:   ['physical-geography','map-reading','climate','population',
                'resources','settlement','economic-geography','nigerian-geography'],
  commerce:    ['trade','retail-wholesale','transport','communication',
                'warehousing','insurance','banking','trade-documents'],
  accounts:    ['accounting-concepts','books-of-accounts','trial-balance',
                'final-accounts','bank-reconciliation','depreciation','partnerships','companies'],
};

// ─── WAIT FOR SUPABASE CDN ────────────────────────────────────────────────────
function waitForSB(cb) {
  if (typeof window.supabase !== 'undefined') {
    sb = window.supabase.createClient(SUPA_URL, SUPA_KEY);
    cb();
  } else {
    setTimeout(() => waitForSB(cb), 50);
  }
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  waitForSB(initAuth);
});

async function initAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    currentUser = session.user;
    await loadProfile();
    updateNavUI();
    checkAccess();
    showStudyPlanWelcome();
  } else {
    renderLoggedOutNav();
  }

  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      currentUser = session.user;
      await loadProfile();
      updateNavUI();
      checkAccess();
    }
    if (event === 'SIGNED_OUT') {
      currentUser = null;
      currentProfile = null;
      renderLoggedOutNav();
    }
  });

  trackAction('page_load', { page: location.pathname });
}

// ─── PROFILE ──────────────────────────────────────────────────────────────────
async function loadProfile() {
  const { data, error } = await sb
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();
  if (!error) currentProfile = data;
}

// ─── NAV UI ───────────────────────────────────────────────────────────────────
function updateNavUI() {
  const p = currentProfile;
  if (!p) return;

  const navRight = document.getElementById('nav-right');
  if (!navRight) return;

  const initials = (p.full_name || 'U')
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const proBadge = p.is_premium
    ? `<span class="nav-pro-badge">PRO</span>`
    : '';

  const streakDays = calcStreakDays(p.usage_logs || []);
  const streakBadge = streakDays > 0
    ? `<div class="streak-badge">🔥 ${streakDays}-day streak</div>`
    : '';

  const firstName = (p.full_name || '').split(' ')[0];

  navRight.innerHTML = `
    ${streakBadge}
    <div class="nav-user-pill">
      <div class="nav-avatar">${initials}${proBadge}</div>
      <div>
        <div style="font-weight:700;font-size:.88rem">${firstName}</div>
        <div class="nav-xp">${p.total_xp || 0} XP</div>
      </div>
    </div>
  `;
}

function renderLoggedOutNav() {
  const navRight = document.getElementById('nav-right');
  if (!navRight) return;
  navRight.innerHTML = `<a href="login.html" class="btn btn-primary" id="nav-auth-btn">Login / Sign Up</a>`;
}

function calcStreakDays(logs) {
  if (!logs || !logs.length) return 0;
  const days = new Set(
    logs
      .filter(l => l.action === 'page_load')
      .map(l => new Date(l.ts).toDateString())
  );
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (days.has(d.toDateString())) { streak++; } else { break; }
  }
  return streak;
}

// ─── ACCESS GUARD ─────────────────────────────────────────────────────────────
function checkAccess() {
  if (!currentProfile) return;
  const { is_premium, subscription_expiry } = currentProfile;
  const expired = is_premium && subscription_expiry && new Date() > new Date(subscription_expiry);

  if (expired) {
    // Mark as expired in DB
    sb.from('profiles')
      .update({ is_premium: false })
      .eq('id', currentUser.id)
      .then(() => {});

    // Show banner
    const banner = document.getElementById('defaulter-banner');
    if (banner) banner.classList.add('visible');

    // Redirect away from premium pages
    const page = location.pathname.split('/').pop();
    if (['classroom.html', 'cbt.html', 'dashboard.html'].includes(page)) {
      window.location.href = 'index.html#pricing';
    }
  }
}

// ─── STUDY PLAN WELCOME MODAL ─────────────────────────────────────────────────
function showStudyPlanWelcome() {
  if (!currentProfile) return;
  if (sessionStorage.getItem('sp_shown')) return;
  sessionStorage.setItem('sp_shown', '1');

  const p = currentProfile;
  const daysToExam = p.exam_date
    ? Math.max(0, Math.round((new Date(p.exam_date) - new Date()) / 86400000))
    : null;

  const gradeMsg = {
    1: "You're in focused reinforcement mode — keep going 💪",
    2: "You're building strong foundations 📈",
    3: "You're at exam-ready level 💪",
  }[p.current_skill_level || 3] || "Let's get you started!";

  let intensity = '4–5 study sessions per week';
  if (daysToExam !== null) {
    if (daysToExam <= 30)  intensity = '2–3 sessions every day';
    else if (daysToExam <= 90) intensity = '1 session every day';
  }

  const readiness = (p.accuracy_avg == null)
    ? '<span class="status-nil">NIL — take your first session to unlock your score prediction</span>'
    : `<strong>${predictJAMBFromProfile(p)} / 400</strong> predicted JAMB range`;

  const examDateStr = daysToExam !== null
    ? `<strong>${daysToExam} days</strong> until your exam`
    : 'Exam date not set';

  const queue = p.smartpath_queue || [];
  const nextTopic = queue[0]
    ? `<p style="margin-top:12px">📌 We recommend starting with <strong>${queue[0].topic_name || queue[0].topic_id}</strong> next.</p>`
    : '';

  const modal = document.createElement('div');
  modal.id = 'sp-modal';
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <div class="modal-card sp-card" style="max-width:500px">
      <button onclick="document.getElementById('sp-modal').remove()"
        style="position:absolute;top:16px;right:16px;background:none;border:none;font-size:1.4rem;cursor:pointer;color:var(--muted)">×</button>
      <h2 style="font-family:var(--font-head);font-size:2rem;margin-bottom:4px">
        Welcome back${p.full_name ? ', ' + p.full_name.split(' ')[0] : ''}! 👋
      </h2>
      <p style="color:var(--muted);margin-bottom:20px">${gradeMsg}</p>
      <div class="sp-stats">
        <div class="sp-stat"><div class="sp-stat-label">Time to Exam</div><div class="sp-stat-val">${examDateStr}</div></div>
        <div class="sp-stat"><div class="sp-stat-label">Current Readiness</div><div class="sp-stat-val">${readiness}</div></div>
        <div class="sp-stat"><div class="sp-stat-label">Recommended Pace</div><div class="sp-stat-val">${intensity}</div></div>
      </div>
      ${nextTopic}
      <button class="btn btn-primary btn-block" style="margin-top:20px"
        onclick="document.getElementById('sp-modal').remove()">Let's Go! 🚀</button>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

function predictJAMBFromProfile(p) {
  if (!p || p.accuracy_avg == null) return '— ';
  return predictJAMB(p.accuracy_avg / 100);
}

// ─── SIGNUP ───────────────────────────────────────────────────────────────────
async function _authHandleSignup({ name, email, pass, exams, examDate, target, subjects, studyMode }) {
  if (!name || !email || pass.length < 8) {
    toast('Please fill all fields correctly (password min 8 chars)'); return;
  }
  if (!subjects || subjects.length === 0) {
    toast('Please select at least one subject'); return;
  }

  toast('Creating your account…');

  const { data: authData, error: authError } = await sb.auth.signUp({ email, password: pass });
  if (authError) { toast('Error: ' + authError.message); return; }

  const uid = authData.user.id;

  // Parse target score to integer
  const targetInt = parseInt((target || '280').split('–')[0].replace('+', '').trim()) || 280;

  // Insert profile
  const { error: profileError } = await sb.from('profiles').insert({
    id: uid,
    full_name: name,
    email,
    exam_types: exams || [],
    exam_date: examDate ? new Date(examDate + ' 1').toISOString().split('T')[0] : null,
    target_score: targetInt,
    exam_subjects: subjects,
    study_mode: studyMode || 'drill',
    current_skill_level: 3,
    total_xp: 0,
    status: 'NIL',
    usage_logs: [],
    smartpath_queue: [],
  });

  if (profileError) { toast('Profile error: ' + profileError.message); return; }

  // Seed topic_mastery rows (NIL — all accuracy_avg = NULL)
  const topicRows = [];
  subjects.forEach(subj => {
    const topics = CURRICULUM[subj] || [];
    topics.forEach(topicId => {
      topicRows.push({
        user_id: uid,
        topic_id: topicId,
        subject: subj,
        accuracy_avg: null,
        mastery_level: null,
        status: 'NIL',
        grade_level: 3,
        attempts_at_grade1: 0,
      });
    });
  });

  if (topicRows.length > 0) {
    const { error: masteryError } = await sb.from('topic_mastery').insert(topicRows);
    if (masteryError) console.warn('topic_mastery seed error:', masteryError.message);
  }

  toast('Account created! Check your email to verify your address.');
}
window._authHandleSignup = _authHandleSignup;

// ─── LOGIN ────────────────────────────────────────────────────────────────────
async function _authHandleLogin(email, pass) {
  if (!email || !pass) { toast('Please fill in all fields'); return; }
  toast('Logging in…');
  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  if (error) {
    toast('Login failed: ' + error.message);
  } else {
    toast('Welcome back!');
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 800);
  }
}
window._authHandleLogin = _authHandleLogin;

// ─── XP ───────────────────────────────────────────────────────────────────────
async function addXP(n, reason) {
  if (!currentUser || !currentProfile) return;
  const newXP = (currentProfile.total_xp || 0) + n;
  currentProfile.total_xp = newXP;
  await sb.from('profiles').update({ total_xp: newXP }).eq('id', currentUser.id);
  // Update nav XP display
  const xpEl = document.querySelector('.nav-xp');
  if (xpEl) xpEl.textContent = newXP + ' XP';
  toast(`+${n} XP — ${reason || ''}`);
}
window.addXP = addXP;

// ─── COMMITMENT TRACKING ──────────────────────────────────────────────────────
async function trackAction(action, meta) {
  if (!currentUser) return;
  const entry = { action, ts: new Date().toISOString(), ...meta };
  // Use Supabase RPC to atomically append to the array
  await sb.rpc('append_usage_log', { uid: currentUser.id, log_entry: entry })
    .then(({ error }) => { if (error) console.warn('trackAction error:', error.message); });
}
window.trackAction = trackAction;

// ─── STUDY MODE HELPERS ───────────────────────────────────────────────────────
function getStudyMode() {
  return (currentProfile && currentProfile.study_mode) || 'drill';
}
window.getStudyMode = getStudyMode;

async function setStudyMode(mode) {
  if (!currentUser) return;
  currentProfile.study_mode = mode;
  await sb.from('profiles').update({ study_mode: mode }).eq('id', currentUser.id);
}
window.setStudyMode = setStudyMode;

function getExamSubjects() {
  return (currentProfile && currentProfile.exam_subjects) || [];
}
window.getExamSubjects = getExamSubjects;

// ─── TOAST (also in app.js — auth.js version takes priority on all pages) ─────
function toast(msg, duration = 3500) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => el.classList.remove('show'), duration);
}
window.toast = toast;

// ─── MANAGE SUBJECTS MODAL ────────────────────────────────────────────────────
function openManageSubjectsModal() {
  const current = getExamSubjects();

  const SUBJ_META = [
    { id:'mathematics',  icon:'📐', name:'Mathematics',         color:'#1a56ff' },
    { id:'english',      icon:'📖', name:'English Language',    color:'#00c97a' },
    { id:'physics',      icon:'⚛️', name:'Physics',             color:'#7c3aed' },
    { id:'chemistry',    icon:'🧪', name:'Chemistry',           color:'#ff6b35' },
    { id:'biology',      icon:'🌿', name:'Biology',             color:'#0891b2' },
    { id:'economics',    icon:'📈', name:'Economics',           color:'#f59e0b' },
    { id:'government',   icon:'🏛️', name:'Government',          color:'#6366f1' },
    { id:'literature',   icon:'📚', name:'Literature',          color:'#ec4899' },
    { id:'geography',    icon:'🌍', name:'Geography',           color:'#10b981' },
    { id:'commerce',     icon:'🏪', name:'Commerce',            color:'#8b5cf6' },
    { id:'accounts',     icon:'💼', name:'Financial Accounting',color:'#14b8a6' },
  ];

  const selected = new Set(current);

  const cards = SUBJ_META.map(s => `
    <div class="subj-card ${selected.has(s.id) ? 'selected' : ''}"
         onclick="this.classList.toggle('selected')"
         data-id="${s.id}">
      <div class="subj-check">✓</div>
      <div class="subj-card-icon">${s.icon}</div>
      <div class="subj-card-name" style="color:${s.color}">${s.name}</div>
    </div>
  `).join('');

  const modal = document.createElement('div');
  modal.id = 'manage-subj-modal';
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <div class="modal-card" style="max-width:600px;max-height:90vh;overflow-y:auto">
      <h2 style="font-family:var(--font-head);font-size:1.8rem;margin-bottom:6px">Manage My Subjects</h2>
      <p style="color:var(--muted);font-size:.88rem;margin-bottom:18px">Select all subjects you are sitting for.</p>
      <div class="subject-grid">${cards}</div>
      <div style="display:flex;gap:10px;margin-top:20px">
        <button class="btn btn-outline" onclick="document.getElementById('manage-subj-modal').remove()">Cancel</button>
        <button class="btn btn-primary" style="flex:1" onclick="_saveSubjects()">Save Changes</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}
window.openManageSubjectsModal = openManageSubjectsModal;

async function _saveSubjects() {
  const cards = document.querySelectorAll('#manage-subj-modal .subj-card.selected');
  const subjects = Array.from(cards).map(c => c.dataset.id);
  if (subjects.length === 0) { toast('Select at least one subject'); return; }

  // Seed any NEW subjects (existing rows are untouched)
  const { data: existing } = await sb
    .from('topic_mastery')
    .select('topic_id, subject')
    .eq('user_id', currentUser.id);

  const existingTopics = new Set((existing || []).map(r => r.topic_id));
  const newRows = [];
  subjects.forEach(subj => {
    (CURRICULUM[subj] || []).forEach(topicId => {
      if (!existingTopics.has(topicId)) {
        newRows.push({
          user_id: currentUser.id, topic_id: topicId, subject: subj,
          accuracy_avg: null, mastery_level: null, status: 'NIL',
          grade_level: 3, attempts_at_grade1: 0,
        });
      }
    });
  });

  if (newRows.length > 0) {
    await sb.from('topic_mastery').insert(newRows);
  }

  await sb.from('profiles')
    .update({ exam_subjects: subjects })
    .eq('id', currentUser.id);

  currentProfile.exam_subjects = subjects;
  toast('Subjects updated!');
  document.getElementById('manage-subj-modal').remove();

  // Reload page so dashboard slideshow refreshes
  setTimeout(() => location.reload(), 600);
}
window._saveSubjects = _saveSubjects;
