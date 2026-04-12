// Supabase credentials (your provided values)
const SUPABASE_URL = 'https://hmfbterdmgoumeeiatji.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtZmJ0ZXJkbWdvdW1lZWlhdGppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3NTAyNzYsImV4cCI6MjA5MTMyNjI3Nn0.JxC-FN5BtBf0keNPqZq8IF-q6A7LMnGoUTkrF3GyEm8';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser = null;
let currentProfile = null;

// ---------- Helper: Toast ----------
function toast(message, duration = 3000) {
  const toastEl = document.getElementById('toast');
  if (!toastEl) return;
  toastEl.innerText = message;
  toastEl.style.display = 'block';
  setTimeout(() => {
    toastEl.style.display = 'none';
  }, duration);
}
window.toast = toast;

// ---------- Add XP ----------
async function addXP(amount, reason) {
  if (!currentProfile) return;
  const newXP = (currentProfile.total_xp || 0) + amount;
  await sb.from('profiles').update({ total_xp: newXP }).eq('id', currentUser.id);
  currentProfile.total_xp = newXP;
  const xpSpan = document.getElementById('nav-xp');
  if (xpSpan) xpSpan.innerText = `${newXP} XP`;
  trackAction('xp_awarded', { amount, reason });
}
window.addXP = addXP;

// ---------- Track Action (usage_logs) ----------
async function trackAction(action, meta = {}) {
  if (!currentUser) return;
  await sb.rpc('append_usage_log', { user_id_param: currentUser.id, action, meta: meta });
}
window.trackAction = trackAction;

// ---------- Load Profile ----------
async function loadProfile() {
  if (!currentUser) return null;
  const { data, error } = await sb
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();
  if (error) {
    console.error(error);
    return null;
  }
  currentProfile = data;
  updateNavUI();
  checkAccess();
  return currentProfile;
}

// ---------- Update Navigation UI ----------
function updateNavUI() {
  if (!currentProfile) return;
  const nameSpan = document.getElementById('nav-user-name');
  if (nameSpan) nameSpan.innerText = currentProfile.full_name?.split(' ')[0] || 'Student';
  const xpSpan = document.getElementById('nav-xp');
  if (xpSpan) xpSpan.innerText = `${currentProfile.total_xp || 0} XP`;
  const proBadge = document.getElementById('nav-pro-badge');
  if (proBadge) {
    const isActivePremium = currentProfile.is_premium && new Date(currentProfile.subscription_expiry) > new Date();
    proBadge.style.display = isActivePremium ? 'inline' : 'none';
  }
  const loginBtn = document.getElementById('nav-login-btn');
  const logoutBtn = document.getElementById('nav-logout-btn');
  if (loginBtn) loginBtn.style.display = 'none';
  if (logoutBtn) logoutBtn.style.display = 'block';
}

// ---------- Subscription Guard ----------
async function checkAccess() {
  if (!currentProfile) return;
  if (currentProfile.is_premium && new Date() > new Date(currentProfile.subscription_expiry)) {
    await sb
      .from('profiles')
      .update({ is_premium: false, subscription_status: 'EXPIRED' })
      .eq('id', currentUser.id);
    currentProfile.is_premium = false;
    const banner = document.getElementById('defaulter-banner');
    if (banner) banner.style.display = 'block';
    if (window.location.pathname.includes('classroom') || window.location.pathname.includes('cbt')) {
      toast('Subscription expired. Redirecting to pricing...');
      setTimeout(() => (window.location.href = 'index.html#pricing'), 3000);
    }
  }
}

// ---------- Auth Modal Logic ----------
function openAuthModal(tab = 'login') {
  const modal = document.getElementById('auth-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  switchAuthTab(tab);
}
function closeAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.style.display = 'none';
}
function switchAuthTab(tab) {
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(btn => btn.classList.remove('active'));
  if (tab === 'login') {
    loginForm.style.display = 'flex';
    signupForm.style.display = 'none';
    document.querySelector('.tab-btn:first-child').classList.add('active');
  } else {
    loginForm.style.display = 'none';
    signupForm.style.display = 'flex';
    document.querySelector('.tab-btn:last-child').classList.add('active');
  }
}
window.openAuthModal = openAuthModal;
window.closeAuthModal = closeAuthModal;
window.switchAuthTab = switchAuthTab;

// ---------- Signup Handler ----------
async function handleSignup(event) {
  event.preventDefault();
  const fullName = document.getElementById('signup-name').value;
  const email = document.getElementById('signup-email').value;
  const password = document.getElementById('signup-password').value;
  const exams = Array.from(document.querySelectorAll('.exam-checks input:checked')).map(cb => cb.value);
  const examDate = document.getElementById('signup-exam-month').value;
  const targetScore = parseInt(document.getElementById('signup-target-score').value);

  if (!fullName || !email || !password || exams.length === 0) {
    toast('Please fill all fields and select at least one exam.');
    return;
  }
  if (password.length < 6) {
    toast('Password must be at least 6 characters.');
    return;
  }

  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) {
    toast(error.message);
    return;
  }
  const userId = data.user.id;

  // Insert profile
  const { error: profileError } = await sb.from('profiles').insert({
    id: userId,
    full_name: fullName,
    email: email,
    exams_selected: exams,
    exam_date: examDate,
    target_jamb_score: targetScore,
    current_skill_level: 3,
    total_xp: 0,
    usage_logs: [],
    is_premium: false,
    subscription_status: 'NIL',
    accuracy_avg: null,
    mastery_level: null,
  });
  if (profileError) {
    console.error(profileError);
    toast('Error creating profile. Please try again.');
    return;
  }

  // Seed topic_mastery with all topics from curriculum (static list)
  const allTopics = ['quadratics', 'logarithms', 'number-bases', 'trigonometry', 'newtons-laws', 'electricity', 'optics', 'comprehension', 'lexis-structure', 'organic-chem', 'periodic-table'];
  const masteryRows = allTopics.map(topic => ({
    user_id: userId,
    topic_id: topic,
    accuracy_avg: null,
    mastery_level: null,
    grade_level: 3,
    attempts_at_grade1: 0,
  }));
  await sb.from('topic_mastery').insert(masteryRows);

  toast('Account created! Check your email to verify.');
  closeAuthModal();
}
window.handleSignup = handleSignup;

// ---------- Login Handler ----------
async function handleLogin(event) {
  event.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    toast(error.message);
    return;
  }
  toast('Logged in!');
  closeAuthModal();
}
window.handleLogin = handleLogin;

// ---------- Study Plan Welcome Modal (once per session) ----------
let studyPlanShown = false;
async function showStudyPlanWelcome() {
  if (studyPlanShown || !currentProfile) return;
  studyPlanShown = true;
  // Build modal content dynamically
  const monthsLeft = currentProfile.exam_date
    ? Math.max(0, Math.ceil((new Date(currentProfile.exam_date) - new Date()) / (1000 * 60 * 60 * 24 * 30)))
    : '?';
  const readiness = currentProfile.accuracy_avg === null ? 'NIL — take your first drill' : `${currentProfile.accuracy_avg}%`;
  const skillLevel = currentProfile.current_skill_level;
  let advice = '';
  if (monthsLeft <= 1) advice = 'High intensity: 2–3 sessions/day';
  else if (monthsLeft <= 3) advice = 'Medium intensity: 1 session/day';
  else advice = 'Steady pace: 4–5 sessions/week';

  const modalHtml = `
    <div id="study-plan-modal" class="modal-backdrop" style="display:flex; z-index:2000;">
      <div class="modal-card">
        <span class="modal-close" onclick="closeStudyPlanModal()">&times;</span>
        <h2>📘 Your Study Plan</h2>
        <div class="sp-stats">📅 ${monthsLeft} month(s) to exam</div>
        <div class="sp-stats">📊 Readiness: ${readiness}</div>
        <div class="sp-stats">🎓 Current Level: Grade ${skillLevel}</div>
        <div class="sp-advice">💡 ${advice}</div>
        <div>Exams registered: ${currentProfile.exams_selected?.join(', ') || 'None'}</div>
        <button class="btn btn-outline" onclick="openAddExamModal()">+ Add / change exams</button>
        <button class="btn btn-primary" onclick="closeStudyPlanModal()">Start Learning →</button>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);
}
window.closeStudyPlanModal = () => {
  const modal = document.getElementById('study-plan-modal');
  if (modal) modal.remove();
};

// Add/change exams modal
window.openAddExamModal = async () => {
  const currentExams = currentProfile.exams_selected || [];
  const examOptions = ['JAMB', 'WAEC', 'NECO', 'Post-UTME'];
  const checkboxes = examOptions.map(ex => `<label><input type="checkbox" value="${ex}" ${currentExams.includes(ex) ? 'checked' : ''}> ${ex}</label>`).join('');
  const modalHtml = `
    <div id="add-exam-modal" class="modal-backdrop" style="display:flex; z-index:2000;">
      <div class="modal-card">
        <h3>Update Your Exams</h3>
        <div class="exam-checks">${checkboxes}</div>
        <button class="btn btn-primary" onclick="saveExamChanges()">Save Changes</button>
        <button class="btn btn-outline" onclick="closeAddExamModal()">Cancel</button>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);
};
window.closeAddExamModal = () => document.getElementById('add-exam-modal')?.remove();
window.saveExamChanges = async () => {
  const selected = Array.from(document.querySelectorAll('#add-exam-modal input:checked')).map(cb => cb.value);
  await sb.from('profiles').update({ exams_selected: selected }).eq('id', currentUser.id);
  currentProfile.exams_selected = selected;
  toast('Exams updated!');
  closeAddExamModal();
};

// ---------- Session Initialization ----------
async function initAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    currentUser = session.user;
    await loadProfile();
    showStudyPlanWelcome();
  } else {
    // Show login button
    const loginBtn = document.getElementById('nav-login-btn');
    if (loginBtn) loginBtn.style.display = 'block';
  }

  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN') {
      currentUser = session.user;
      await loadProfile();
      showStudyPlanWelcome();
      trackAction('login');
    }
    if (event === 'SIGNED_OUT') {
      currentUser = null;
      currentProfile = null;
      window.location.reload();
    }
  });
}

document.addEventListener('DOMContentLoaded', initAuth);