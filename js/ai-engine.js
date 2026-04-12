// ============================================================
// UltimateEdge School — /js/cbt-engine.js  (v3.2)
// Load AFTER ai-engine.js. Only included on cbt.html.
//
// Drill question set logic: wrong-answer-priority mixing.
// Students face their missed questions repeatedly until correct.
// No internal algorithm names exposed to users.
// ============================================================

// ── IndexedDB: offline answer queue ──────────────────────────
const IDB_NAME    = 'ue-school-v3';
const IDB_STORE   = 'queued_logs';
let   _idb        = null;

function openIDB() {
  return new Promise((res, rej) => {
    if (_idb) return res(_idb);
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = e =>
      e.target.result.createObjectStore(IDB_STORE, { keyPath: 'id', autoIncrement: true });
    req.onsuccess = e => { _idb = e.target.result; res(_idb); };
    req.onerror   = e => rej(e.target.error);
  });
}

async function saveLogOffline(entry) {
  const db    = await openIDB();
  const tx    = db.transaction(IDB_STORE, 'readwrite');
  tx.objectStore(IDB_STORE).add(entry);
  return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
}

async function getAllQueued() {
  const db = await openIDB();
  const tx = db.transaction(IDB_STORE, 'readonly');
  return new Promise((res, rej) => {
    const req = tx.objectStore(IDB_STORE).getAll();
    req.onsuccess = () => res(req.result);
    req.onerror   = rej;
  });
}

async function clearQueued(ids) {
  const db    = await openIDB();
  const tx    = db.transaction(IDB_STORE, 'readwrite');
  const store = tx.objectStore(IDB_STORE);
  ids.forEach(id => store.delete(id));
  return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
}

// ── Online sync: flush queue to Supabase ─────────────────────
window.syncOfflineLogs = async function() {
  if (!navigator.onLine || !window.currentUser || !window.sb) return;
  try {
    const queued = await getAllQueued();
    if (!queued.length) return;
    const rows = queued.map(({ id, ...rest }) => rest);
    const { error } = await window.sb.from('response_logs').insert(rows);
    if (!error) {
      await clearQueued(queued.map(q => q.id));
      console.log('[UE] Synced', rows.length, 'offline response(s).');
    }
  } catch (e) {
    console.warn('[UE] Offline sync failed:', e.message);
  }
};

// Auto-sync when browser comes back online
window.addEventListener('online', window.syncOfflineLogs);
// Listen for service worker sync signal
navigator.serviceWorker?.addEventListener('message', e => {
  if (e.data?.type === 'SW_SYNC_REQUEST') window.syncOfflineLogs();
});

// ── Record one question response ─────────────────────────────
window.recordResponse = async function({ topic_id, exam_type, is_correct, time_spent, grade_level }) {
  if (!window.currentUser) return;
  const entry = {
    user_id:    window.currentUser.id,
    topic_id,
    exam_type,
    is_correct,
    time_spent,
    grade_level: grade_level || window.currentProfile?.current_skill_level || 3
  };
  if (navigator.onLine && window.sb) {
    const { error } = await window.sb.from('response_logs').insert(entry);
    if (error) await saveLogOffline(entry);
  } else {
    await saveLogOffline(entry);
  }
};

// ── Recalculate and upsert topic_mastery after each answer ───
window.updateTopicMastery = async function(topic_id) {
  if (!window.currentUser || !window.sb) return null;
  try {
    const { data: logs } = await window.sb
      .from('response_logs')
      .select('is_correct')
      .eq('user_id', window.currentUser.id)
      .eq('topic_id', topic_id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!logs?.length) return null;

    const attempts  = logs.length;
    const correct   = logs.filter(l => l.is_correct).length;
    const accuracy  = parseFloat(((correct / attempts) * 100).toFixed(2));
    const mastery   = window.calcMastery(accuracy, attempts);
    const status    = mastery >= 0.75 ? 'MASTERED' : 'IN_PROGRESS';

    await window.sb.from('topic_mastery').upsert({
      user_id:       window.currentUser.id,
      topic_id,
      accuracy_avg:  accuracy,      // correct column name (not accuracy_score)
      mastery_level: mastery,
      status,
      last_studied:  new Date().toISOString()
    }, { onConflict: 'user_id,topic_id' });

    // Refresh overall profile accuracy in background
    updateOverallAccuracy();
    return { accuracy, mastery, attempts };
  } catch (e) {
    console.warn('[UE] updateTopicMastery error:', e.message);
    return null;
  }
};

// Update overall profile accuracy from all response_logs
async function updateOverallAccuracy() {
  if (!window.currentUser || !window.sb) return;
  try {
    const { data } = await window.sb
      .from('response_logs')
      .select('is_correct')
      .eq('user_id', window.currentUser.id);
    if (!data?.length) return;
    const attempts = data.length;
    const correct  = data.filter(l => l.is_correct).length;
    const accuracy = parseFloat(((correct / attempts) * 100).toFixed(2));
    const mastery  = window.calcMastery(accuracy, Math.min(attempts, 50));
    await window.sb.from('profiles').update({
      accuracy_avg: accuracy, mastery_level: mastery, status: 'ACTIVE'
    }).eq('id', window.currentUser.id);
    if (window.currentProfile) {
      window.currentProfile.accuracy_avg  = accuracy;
      window.currentProfile.mastery_level = mastery;
      window.currentProfile.status        = 'ACTIVE';
    }
  } catch (e) { /* non-fatal */ }
}

// ── Award XP for correct answer (+10 per spec) ────────────────
window.awardXP = async function(is_correct) {
  if (is_correct && window.addXP) await window.addXP(10, 'Correct answer');
};

// ── Save completed session to session_scores ─────────────────
window.saveSessionScore = async function({
  topic_id, exam_type, session_type,
  score, total_questions, accuracy, avg_time_per_q, grade_level
}) {
  if (!window.currentUser || !window.sb) return;
  try {
    await window.sb.from('session_scores').insert({
      user_id:         window.currentUser.id,
      topic_id:        topic_id || null,
      exam_type,
      session_type:    session_type || 'drill',
      score,
      total_questions,
      accuracy:        parseFloat(accuracy.toFixed(2)),
      avg_time_per_q:  parseFloat((avg_time_per_q || 0).toFixed(1)),
      grade_level:     grade_level || window.currentProfile?.current_skill_level || 3
    });
  } catch (e) { console.warn('[UE] saveSessionScore error:', e.message); }
};

// ── BUILD DRILL QUESTION SET ─────────────────────────────────
// Priority: re-test previously wrong answers first, then add fresh questions.
// Spec: 5 from "wrong list" + 5 new/random = 10 questions per topic drill.
// (No internal algorithm names shown to users — it's just "Smart Drill".)
window.buildDrillSet = async function(topicId, allQuestions) {
  const topicQs  = allQuestions.filter(q => q.topic_id === topicId);
  const pool     = topicQs.length >= 5 ? topicQs : allQuestions;
  const shuffled = shuffle([...pool]);

  if (!window.currentUser || !window.sb) {
    return shuffled.slice(0, 10);
  }

  // Fetch recent wrong-answer question IDs for this topic
  let wrongSet = [];
  try {
    const { data } = await window.sb
      .from('response_logs')
      .select('topic_id, is_correct, created_at')
      .eq('user_id', window.currentUser.id)
      .eq('topic_id', topicId)
      .eq('is_correct', false)
      .order('created_at', { ascending: false })
      .limit(10);
    wrongSet = data || [];
  } catch (_) {}

  // Up to 5 retry slots from wrong history, 5 fresh slots
  const retrySlot = shuffled.slice(0, Math.min(5, wrongSet.length || 5));
  const freshSlot = shuffled.filter(q => !retrySlot.includes(q)).slice(0, 5);
  return [...retrySlot, ...freshSlot].slice(0, 10);
};

// ── BUILD FULL MOCK SET ───────────────────────────────────────
window.buildMockSet = function(allQuestions) {
  return shuffle([...allQuestions]).slice(0, 40);
};

// ── Utility: shuffle ──────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Register service worker ───────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .catch(e => console.warn('[UE] SW registration failed:', e));
  });
}

// ── On load: attempt offline sync ────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(window.syncOfflineLogs, 3500);
});
