/* ── UltimateEdge School — cbt-engine.js v4.1 ── */
/* Answer recording · IndexedDB offline · topic mastery update · XP · flag logic */

// ─── INDEXEDDB SETUP ──────────────────────────────────────────────────────────
const IDB_NAME    = 'ue_offline';
const IDB_STORE   = 'queued_logs';
const IDB_VERSION = 1;

let idb; // Will be set after openIDB()

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { autoIncrement: true });
      }
    };
    req.onsuccess = e => { idb = e.target.result; resolve(idb); };
    req.onerror   = e => reject(e.target.error);
  });
}

// Queue a log entry in IndexedDB (when offline)
function idbQueue(entry) {
  return new Promise((resolve, reject) => {
    const tx    = idb.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    const req   = store.add(entry);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

// Retrieve all queued logs
function idbGetAll() {
  return new Promise((resolve, reject) => {
    const tx    = idb.transaction(IDB_STORE, 'readonly');
    const store = tx.objectStore(IDB_STORE);
    const req   = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

// Clear all queued logs (after successful sync)
function idbClear() {
  return new Promise((resolve, reject) => {
    const tx    = idb.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    const req   = store.clear();
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

// ─── INITIALISE ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  openIDB().catch(err => console.warn('IndexedDB unavailable:', err));
});

// Sync queued logs when connection is restored
window.addEventListener('online', () => syncOfflineLogs());

// ─── RECORD RESPONSE ─────────────────────────────────────────────────────────
/**
 * Called for every question answered.
 * Saves to Supabase if online, IndexedDB if offline.
 *
 * @param {{ topicId, isCorrect, timeSpent, gradeLevel, examType }} params
 */
async function recordResponse({ topicId, isCorrect, timeSpent, gradeLevel, examType }) {
  if (!currentUser) return;

  const entry = {
    user_id:    currentUser.id,
    topic_id:   topicId,
    exam_type:  examType || 'JAMB',
    is_correct: isCorrect,
    time_spent: timeSpent || 0,
    grade_level: gradeLevel || 3,
  };

  if (navigator.onLine && typeof sb !== 'undefined') {
    const { error } = await sb.from('response_logs').insert(entry);
    if (error) {
      console.warn('response_logs insert failed, queuing offline:', error.message);
      if (idb) await idbQueue(entry);
    }
  } else {
    if (idb) await idbQueue(entry);
  }
}
window.recordResponse = recordResponse;

// ─── SYNC OFFLINE LOGS ────────────────────────────────────────────────────────
async function syncOfflineLogs() {
  if (!idb || !navigator.onLine || !currentUser || typeof sb === 'undefined') return;

  try {
    const queued = await idbGetAll();
    if (!queued || queued.length === 0) return;

    // Supabase insert supports batch
    const { error } = await sb.from('response_logs').insert(queued);
    if (!error) {
      await idbClear();
      console.log(`Synced ${queued.length} offline response(s).`);
    }
  } catch (err) {
    console.warn('Offline sync failed:', err);
  }
}
window.syncOfflineLogs = syncOfflineLogs;

// ─── UPDATE TOPIC MASTERY ─────────────────────────────────────────────────────
/**
 * Recalculates accuracy_avg + mastery_level for a topic after an answer.
 * Also increments attempts_at_grade1 if the student is on Grade 1.
 */
async function updateTopicMastery(topicId, isCorrect) {
  if (!currentUser || typeof sb === 'undefined') return;

  // Fetch existing mastery row
  const { data: row, error: fetchError } = await sb
    .from('topic_mastery')
    .select('*')
    .eq('user_id', currentUser.id)
    .eq('topic_id', topicId)
    .single();

  if (fetchError && fetchError.code !== 'PGRST116') {
    console.warn('updateTopicMastery fetch error:', fetchError.message);
    return;
  }

  // Calculate new running average
  const prevAccuracy = row?.accuracy_avg ?? null;
  const prevAttempts = row
    ? (row.attempts_at_grade1 !== undefined ? row.attempts_at_grade1 : 0)
    : 0;

  // We need total response count for proper running avg
  const { count: totalCount } = await sb
    .from('response_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', currentUser.id)
    .eq('topic_id', topicId);

  const { count: correctCount } = await sb
    .from('response_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', currentUser.id)
    .eq('topic_id', topicId)
    .eq('is_correct', true);

  const total   = totalCount || 1;
  const correct = correctCount || 0;
  const newAccuracy  = parseFloat(((correct / total) * 100).toFixed(2));
  const newMastery   = calcMastery(newAccuracy, total);
  const newGrade     = getSkillGrade(newAccuracy);

  const newAttempts1 = (row?.grade_level === 1 && !isCorrect)
    ? prevAttempts + 1
    : prevAttempts;

  const updates = {
    accuracy_avg:       newAccuracy,
    mastery_level:      newMastery,
    grade_level:        newGrade,
    attempts_at_grade1: newAttempts1,
    status:             newMastery >= 0.60 ? 'MASTERED' : 'IN_PROGRESS',
    last_studied:       new Date().toISOString(),
  };

  if (row) {
    await sb.from('topic_mastery')
      .update(updates)
      .eq('user_id', currentUser.id)
      .eq('topic_id', topicId);
  } else {
    await sb.from('topic_mastery').insert({
      user_id: currentUser.id,
      topic_id: topicId,
      subject: 'unknown',
      ...updates,
    });
  }

  return { newAccuracy, newMastery, newGrade, attemptsAtGrade1: newAttempts1 };
}
window.updateTopicMastery = updateTopicMastery;

// ─── AWARD XP ─────────────────────────────────────────────────────────────────
async function awardXP(isCorrect) {
  if (!isCorrect) return;
  if (typeof addXP === 'function') await addXP(10, 'correct answer');
}
window.awardXP = awardXP;

// ─── SESSION SCORE SAVE ───────────────────────────────────────────────────────
/**
 * Called when a CBT session ends.
 * Saves session summary and triggers SmartPath queue update.
 */
async function saveSessionScore({ examType, score, totalQuestions, accuracy, avgTimeSecs, gradeLevel, topicId }) {
  if (!currentUser || typeof sb === 'undefined') return;

  await sb.from('session_scores').insert({
    user_id:         currentUser.id,
    exam_type:       examType || 'JAMB',
    score,
    total_questions: totalQuestions,
    accuracy,
    avg_time_per_q:  avgTimeSecs || 0,
    grade_level:     gradeLevel || 3,
  });

  if (typeof trackAction === 'function') {
    await trackAction('drill_completed', { score, totalQuestions, accuracy, topicId });
  }

  // Update overall accuracy_avg on profiles
  const { data: allSessions } = await sb
    .from('session_scores')
    .select('accuracy')
    .eq('user_id', currentUser.id);

  if (allSessions && allSessions.length > 0) {
    const overallAvg = parseFloat(
      (allSessions.reduce((s, r) => s + (r.accuracy || 0), 0) / allSessions.length).toFixed(2)
    );
    await sb.from('profiles').update({ accuracy_avg: overallAvg }).eq('id', currentUser.id);
    if (currentProfile) currentProfile.accuracy_avg = overallAvg;
  }

  // Update SmartPath queue
  if (typeof updateSmartPathQueue === 'function') {
    await updateSmartPathQueue();
  }
}
window.saveSessionScore = saveSessionScore;

// ─── FLAG LOGIC ───────────────────────────────────────────────────────────────
// Flags are session-memory only — not persisted to Supabase
const flaggedQuestions = new Set();

function flagQuestion(index) {
  if (flaggedQuestions.has(index)) {
    flaggedQuestions.delete(index);
  } else {
    flaggedQuestions.add(index);
  }
  return flaggedQuestions.has(index);
}
window.flagQuestion = flagQuestion;

function isFlagged(index) {
  return flaggedQuestions.has(index);
}
window.isFlagged = isFlagged;

function getFlaggedList() {
  return Array.from(flaggedQuestions).sort((a, b) => a - b);
}
window.getFlaggedList = getFlaggedList;

function clearFlags() {
  flaggedQuestions.clear();
}
window.clearFlags = clearFlags;
