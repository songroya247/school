/* ================================================================
   cbt-engine.js — UltimateEdge v2.1
   Adaptive CBT: drill vs exam mode, question sourcing,
   response logging (online + IndexedDB offline), mastery update
   ================================================================ */

/* ── IndexedDB: offline log store ── */
const IDB_NAME = 'ue_offline_logs';
const IDB_STORE = 'pending_logs';

function openIDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore(IDB_STORE, { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e.target.error);
  });
}

async function saveLogOffline(log) {
  const db = await openIDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).add(log);
    tx.oncomplete = res;
    tx.onerror = rej;
  });
}

async function getPendingLogs() {
  const db = await openIDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).getAll();
    req.onsuccess = () => res(req.result);
    req.onerror = rej;
  });
}

async function clearPendingLogs() {
  const db = await openIDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).clear();
    tx.oncomplete = res;
    tx.onerror = rej;
  });
}

/* ── SYNC: flush offline logs to Supabase when online ── */
async function syncOfflineLogs(sb, userId) {
  if (!navigator.onLine || !sb || !userId) return;
  const pending = await getPendingLogs();
  if (!pending.length) return;

  const rows = pending.map(({ id, ...log }) => ({ ...log, user_id: userId }));
  const { error } = await sb.from('response_logs').insert(rows);
  if (!error) {
    await clearPendingLogs();
    console.log(`[UE] Synced ${rows.length} offline logs`);
  }
}

/* ── RECORD RESPONSE ────────────────────────────────────────
   Called after every question answer.
   If offline → saves to IndexedDB; if online → Supabase insert
   ──────────────────────────────────────────────────────────── */
async function recordResponse({ sb, userId, topicId, isCorrect, timeSpent, examType = 'JAMB' }) {
  const log = {
    user_id:    userId,
    topic_id:   topicId,
    is_correct: isCorrect,
    time_spent: timeSpent,
    exam_type:  examType,
    created_at: new Date().toISOString()
  };

  if (!navigator.onLine) {
    await saveLogOffline(log);
    return;
  }

  try {
    await sb.from('response_logs').insert(log);
  } catch (e) {
    await saveLogOffline(log); // fallback to offline
  }
}

/* ── UPDATE TOPIC MASTERY ───────────────────────────────────
   Recalculates from last 50 logs for the topic using the formula:
   M = (accuracy% × 0.7) + (min(solved/50, 1) × 0.3)
   ──────────────────────────────────────────────────────────── */
async function updateTopicMastery(sb, userId, topicId) {
  const { data: logs } = await sb
    .from('response_logs')
    .select('is_correct, time_spent')
    .eq('user_id', userId)
    .eq('topic_id', topicId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (!logs?.length) return null;

  const accuracy = Math.round(logs.filter(l => l.is_correct).length / logs.length * 100);
  const speed    = Math.round(logs.reduce((s, l) => s + (l.time_spent || 0), 0) / logs.length);
  const solved   = logs.length;
  const mastery  = parseFloat(((accuracy / 100 * 0.7) + (Math.min(solved / 50, 1) * 0.3)).toFixed(3));

  await sb.from('topic_mastery').upsert({
    user_id:         userId,
    topic_id:        topicId,
    accuracy_avg:    accuracy,
    speed_avg:       speed,
    questions_solved: solved,
    mastery_level:   mastery,
    last_studied:    new Date().toISOString()
  }, { onConflict: 'user_id,topic_id' });

  return { accuracy, speed, solved, mastery };
}

/* ── AWARD XP ─────────────────────────────────────────────── */
async function awardXP(sb, userId, profile, isCorrect, isLessonComplete = false) {
  let xp = 0;
  if (isCorrect)        xp += 10;   // +10 XP for correct answer
  if (isLessonComplete) xp += 50;   // +50 XP for lesson completion
  if (!xp) return;
  const newXP = (profile?.total_xp || 0) + xp;
  await sb.from('profiles').update({ total_xp: newXP }).eq('id', userId);
  if (typeof toast === 'function' && xp > 0) toast(`+${xp} XP`);
  return newXP;
}

/* ── EXAM MODES ─────────────────────────────────────────────
   Drill Mode: mastery_level < 0.50 → hide timer, focus accuracy
   Exam Mode:  mastery_level ≥ 0.50 → show 45s countdown
   ──────────────────────────────────────────────────────────── */
const DRILL_THRESHOLD = 0.50;
const EXAM_TIME_PER_Q = 45; // seconds

function getModeForTopic(masteryLevel) {
  return masteryLevel < DRILL_THRESHOLD ? 'drill' : 'exam';
}

/* ── SAVE SESSION SCORE ─────────────────────────────────────── */
async function saveSessionScore(sb, userId, { subject, examType, accuracy, predictedScore, waecGrade }) {
  await sb.from('session_scores').insert({
    user_id:         userId,
    subject,
    exam_type:       examType,
    accuracy,
    predicted_score: predictedScore,
    waec_grade:      waecGrade,
    session_date:    new Date().toISOString()
  });
}

/* ── OFFLINE SYNC ON RECONNECT ──────────────────────────────── */
window.addEventListener('online', () => {
  if (typeof sb !== 'undefined' && typeof currentUser !== 'undefined' && currentUser) {
    syncOfflineLogs(sb, currentUser.id);
  }
});

/* Register service worker */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(reg => {
        // Listen for DO_SYNC message from SW
        navigator.serviceWorker.addEventListener('message', e => {
          if (e.data?.type === 'DO_SYNC' && typeof sb !== 'undefined' && currentUser) {
            syncOfflineLogs(sb, currentUser.id);
          }
        });
      });
  });
}