/* ================================================================
   ai-engine.js — UltimateEdge v2.1
   Unified Mastery Score, Triple-Threat Prediction, SmartPath
   ================================================================ */

/* ── 3.1  UNIFIED MASTERY SCORE ──────────────────────────────
   M = (accuracy% × 0.7) + (min(solved/50, 1) × 0.3)
   Returns 0.0–1.0
   ──────────────────────────────────────────────────────────── */
function calcMastery(accuracyPct, questionsSolved) {
  const acc = Math.min(100, Math.max(0, accuracyPct)) / 100;
  const exp = Math.min(questionsSolved / 50, 1);
  return parseFloat((acc * 0.7 + exp * 0.3).toFixed(3));
}

/* ── 3.2  TRIPLE-THREAT PREDICTION ──────────────────────────

   A. JAMB (Points Engine)
      Base    = avgMastery × 400
      Speed Modifier S:
        avgSpeed < 45s → S = 1.05
        avgSpeed > 65s → S = 0.90
        else           → S = 1.00
      Result  = Base × S  (display as ±10 range)

   B. WAEC/NECO Grade Engine
      M ≥ 0.75 → A1
      M ≥ 0.70 → B2
      M ≥ 0.65 → B3
      M ≥ 0.50 → C4
      M ≥ 0.45 → C5
      M ≥ 0.40 → C6
      M ≥ 0.35 → D7
      M ≥ 0.30 → E8
      M < 0.30 → F9
   ──────────────────────────────────────────────────────────── */

function predictJAMB(masteryScores, avgSpeedSecs) {
  const scores = Object.values(masteryScores);
  if (!scores.length) return { score: 0, low: 0, high: 0 };
  const avgM = scores.reduce((s, v) => s + v, 0) / scores.length;
  const base = avgM * 400;
  const S = avgSpeedSecs < 45 ? 1.05 : avgSpeedSecs > 65 ? 0.90 : 1.00;
  const score = Math.min(400, Math.max(50, Math.round(base * S)));
  return { score, low: Math.max(50, score - 10), high: Math.min(400, score + 10) };
}

function predictWAECGrade(masteryScore) {
  const m = masteryScore; // 0.0–1.0
  if (m >= 0.75) return { grade: 'A1', label: 'Distinction', color: '#16a34a' };
  if (m >= 0.70) return { grade: 'B2', label: 'Very Good',   color: '#2563eb' };
  if (m >= 0.65) return { grade: 'B3', label: 'Good',        color: '#2563eb' };
  if (m >= 0.50) return { grade: 'C4', label: 'Credit',      color: '#d97706' };
  if (m >= 0.45) return { grade: 'C5', label: 'Credit',      color: '#d97706' };
  if (m >= 0.40) return { grade: 'C6', label: 'Credit',      color: '#d97706' };
  if (m >= 0.35) return { grade: 'D7', label: 'Pass',        color: '#dc2626' };
  if (m >= 0.30) return { grade: 'E8', label: 'Pass',        color: '#dc2626' };
  return             { grade: 'F9', label: 'Fail',           color: '#7f1d1d' };
}

/* Returns same grade scale for NECO */
const predictNECOGrade = predictWAECGrade;

/* ── 3.3  SMARTPATH / WEAKNESS MAP ──────────────────────────
   Returns top-N topics where mastery_level < threshold
   ──────────────────────────────────────────────────────────── */
function getWeakTopics(topicMasteryRows, threshold = 0.60, topN = 3) {
  return topicMasteryRows
    .filter(t => t.mastery_level < threshold && t.questions_solved > 0)
    .sort((a, b) => a.mastery_level - b.mastery_level)
    .slice(0, topN);
}

/* Returns all topics with mastery < threshold (for Mastery Mode question sourcing) */
function getWeakTopicIds(topicMasteryRows, threshold = 0.60) {
  return topicMasteryRows
    .filter(t => t.mastery_level < threshold)
    .map(t => t.topic_id);
}

/* ── UPDATE MASTERY ROW from log slice ─────────────────────── */
function computeMasteryFromLogs(logs) {
  if (!logs.length) return { accuracy_avg: 0, speed_avg: 0, mastery_level: 0 };
  const correct = logs.filter(l => l.is_correct).length;
  const accuracyPct = Math.round(correct / logs.length * 100);
  const speed_avg   = Math.round(logs.reduce((s, l) => s + (l.time_spent || 0), 0) / logs.length);
  const mastery_level = calcMastery(accuracyPct, logs.length);
  return { accuracy_avg: accuracyPct, speed_avg, questions_solved: logs.length, mastery_level };
}

/* ── DRILL vs EXAM MODE ─────────────────────────────────────
   Drill:  mastery_level < 0.50  (hide timer, focus accuracy)
   Exam:   mastery_level ≥ 0.50  (show 45s countdown)
   ──────────────────────────────────────────────────────────── */
function isDrillMode(masteryLevel) {
  return masteryLevel < 0.50;
}

/* ── WAEC SUBJECT MAP ───────────────────────────────────────── */
const TOPIC_TO_SUBJECT = {
  quadratics:'mathematics', algebra:'mathematics', trigonometry:'mathematics',
  calculus:'mathematics',   statistics:'mathematics', geometry:'mathematics',
  mechanics:'physics',      waves:'physics',    electricity:'physics',
  optics:'physics',         thermodynamics:'physics',
  comprehension:'english',  lexis:'english', 'oral-english':'english', grammar:'english',
  'organic-chemistry':'chemistry', 'inorganic-chemistry':'chemistry', 'physical-chemistry':'chemistry',
  genetics:'biology',       ecology:'biology', physiology:'biology'
};

/* ── SUBJECT MASTERY AGGREGATION ────────────────────────────── */
function aggregateBySubject(topicMasteryRows) {
  const subMap = {};
  topicMasteryRows.forEach(t => {
    const subj = TOPIC_TO_SUBJECT[t.topic_id] || 'other';
    if (!subMap[subj]) subMap[subj] = { total: 0, count: 0 };
    subMap[subj].total += t.mastery_level;
    subMap[subj].count++;
  });
  const result = {};
  Object.entries(subMap).forEach(([k, v]) => {
    result[k] = v.count ? parseFloat((v.total / v.count).toFixed(3)) : 0;
  });
  return result;
}

/* ── EXPORT (module-safe) ──────────────────────────────────── */
if (typeof module !== 'undefined') {
  module.exports = { calcMastery, predictJAMB, predictWAECGrade, predictNECOGrade, getWeakTopics, getWeakTopicIds, computeMasteryFromLogs, isDrillMode, aggregateBySubject, TOPIC_TO_SUBJECT };
}
