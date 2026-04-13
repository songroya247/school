/**
 * UltimateEdge School — auth.js v4.1
 * Manages Session, Signup (4-Steps), Seeding, and Globals.
 */

// 1. Initialize Supabase Client
const SUPA_URL = "YOUR_SUPABASE_PROJECT_URL";
const SUPA_KEY = "YOUR_SUPABASE_ANON_KEY";
const sb = supabase.createClient(SUPA_URL, SUPA_KEY);

// 2. Globals
let currentUser = null;
let currentProfile = null;

// 3. Auth Lifecycle
document.addEventListener('DOMContentLoaded', () => {
    initAuth();
});

async function initAuth() {
    const { data: { session }, error } = await sb.auth.getSession();
    
    if (session) {
        currentUser = session.user;
        await loadProfile();
        updateNavUI();
        checkAccess();
        trackAction('page_load', { path: window.location.pathname });
        
        // Show Welcome Modal once per browser session
        if (!sessionStorage.getItem('ue_welcome_shown')) {
            showStudyPlanWelcome();
            sessionStorage.setItem('ue_welcome_shown', 'true');
        }
    } else {
        updateNavUI(); // Show login button
    }
}

async function loadProfile() {
    const { data, error } = await sb
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();
    
    if (data) currentProfile = data;
}

// 4. Signup Flow (§9 & §28)
async function handleSignup(event) {
    event.preventDefault();
    const btn = event.target.querySelector('button[type="submit"]');
    btn.disabled = true;

    // Data from Step 1 (Auth)
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const full_name = document.getElementById('reg-name').value;

    // Data from Step 2 (Goals)
    const exam_types = Array.from(document.querySelectorAll('.exam-check:checked')).map(el => el.value);
    const exam_date = document.getElementById('reg-exam-date').value;
    const target_score = parseInt(document.getElementById('reg-target-score').value);

    // Data from Step 3 (Subjects §28)
    const exam_subjects = Array.from(document.querySelectorAll('.subj-card.selected')).map(el => el.dataset.id);

    // Data from Step 4 (Mode)
    const study_mode = document.querySelector('input[name="study_preference"]:checked').value;

    if (exam_subjects.length === 0) {
        toast("Please select at least one subject.");
        btn.disabled = false;
        return;
    }

    // A. Create Supabase Auth User
    const { data: authData, error: authError } = await sb.auth.signUp({
        email, password, options: { data: { full_name } }
    });

    if (authError) {
        toast(authError.message);
        btn.disabled = false;
        return;
    }

    const userId = authData.user.id;

    // B. Create Profile Row
    const { error: profError } = await sb.from('profiles').insert([{
        id: userId,
        full_name,
        email,
        exam_types,
        exam_date,
        target_score,
        exam_subjects,
        study_mode,
        status: 'NIL'
    }]);

    if (profError) {
        toast("Profile creation failed.");
        btn.disabled = false;
        return;
    }

    // C. Seed topic_mastery ONLY for selected subjects (§9)
    await seedTopicMastery(userId, exam_subjects);

    toast("Account created! Please check your email to verify.");
    closeAuthModal();
}

/**
 * Seeds NULL topic_mastery rows for topics belonging to selected subjects.
 * Note: curriculumMap would typically be imported from a curriculum.json
 */
async function seedTopicMastery(userId, subjects) {
    // This is a representative map; in production, this pulls from curriculum.json
    const curriculumMap = {
        'mathematics': ['quadratics', 'trigonometry', 'calculus', 'statistics'],
        'english': ['lexis-structure', 'comprehension', 'oral-english'],
        'physics': ['mechanics', 'optics', 'electricity'],
        'chemistry': ['organic-chem', 'periodicity', 'stoichiometry']
        // ... more subjects from §28
    };

    let topicsToSeed = [];
    subjects.forEach(sub => {
        if (curriculumMap[sub]) {
            curriculumMap[sub].forEach(topic => {
                topicsToSeed.push({ 
                    user_id: userId, 
                    topic_id: topic, 
                    accuracy_avg: null, // NIL status
                    mastery_level: null, 
                    status: 'NIL' 
                });
            });
        }
    });

    if (topicsToSeed.length > 0) {
        await sb.from('topic_mastery').insert(topicsToSeed);
    }
}

// 5. Shared Utilities (§20)
function getStudyMode() {
    return currentProfile ? currentProfile.study_mode : 'drill';
}

async function setStudyMode(mode) {
    if (!currentUser) return;
    const { error } = await sb.from('profiles').update({ study_mode: mode }).eq('id', currentUser.id);
    if (!error) {
        currentProfile.study_mode = mode;
        toast(`Mode switched to ${mode}`);
    }
}

function getExamSubjects() {
    return currentProfile ? currentProfile.exam_subjects : [];
}

async function checkAccess() {
    if (!currentProfile) return;
    const { is_premium, subscription_expiry } = currentProfile;
    
    if (is_premium && subscription_expiry) {
        if (new Date() > new Date(subscription_expiry)) {
            // Subscription Expired
            await sb.from('profiles').update({ is_premium: false }).eq('id', currentUser.id);
            document.getElementById('defaulter-banner').style.display = 'block';
            if (window.location.pathname.includes('classroom') || window.location.pathname.includes('cbt')) {
                window.location.href = '/index.html#pricing';
            }
        }
    }
}

async function trackAction(action, meta = {}) {
    if (!currentUser) return;
    const logEntry = {
        action,
        meta,
        timestamp: new Date().toISOString()
    };
    await sb.rpc('append_usage_log', { 
        user_id: currentUser.id, 
        new_log: JSON.stringify([logEntry]) 
    });
}

async function addXP(amount, reason) {
    if (!currentUser || !currentProfile) return;
    const newXP = (currentProfile.total_xp || 0) + amount;
    const { error } = await sb.from('profiles').update({ total_xp: newXP }).eq('id', currentUser.id);
    if (!error) {
        currentProfile.total_xp = newXP;
        updateNavUI();
        toast(`+${amount} XP: ${reason}`);
    }
}

function toast(message) {
    const box = document.getElementById('toast');
    if (!box) return;
    box.innerText = message;
    box.classList.add('show');
    setTimeout(() => box.classList.remove('show'), 3000);
}

// 6. Navigation & UI Updates (Placeholders for Milestone 2)
function updateNavUI() {
    // Implementation will target UE-Nav elements defined in main.css
    console.log("Nav UI Updated for:", currentProfile?.full_name || "Guest");
}

function openAuthModal(tab = 'login') {
    document.getElementById('auth-modal').style.display = 'flex';
    // Switch logic for login/signup tabs...
}

function closeAuthModal() {
    document.getElementById('auth-modal').style.display = 'none';
}

function showStudyPlanWelcome() {
    console.log("Study Plan Welcome Triggered");
    // Implementation in Milestone 2
}