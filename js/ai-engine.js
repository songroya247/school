/* ═══════════════════════════════════════════════════════════
   UE School — ai-engine.js  v4.1
   Mastery calculation, JAMB prediction, adaptive pyramid,
   SmartPath recommendations, video routing.
   WAEC/NECO grades are INTERNAL ONLY — never rendered
   in student-facing pages.
   ═══════════════════════════════════════════════════════════ */

/* ── SCORE PREDICTION ── */

/**
 * Predict JAMB score range from accuracy (0–100) and avg time per question.
 * Returns a string like "265–285".
 */
function predictJAMB(accuracyAvg, avgTimePerQ = 55) {
  if (accuracyAvg === null || accuracyAvg === undefined) return '— / 400';
  let base = (accuracyAvg / 100) * 400;
  let factor = 1.00;
  if (avgTimePerQ < 45) factor = 1.05;
  else if (avgTimePerQ > 65) factor = 0.90;
  const mid   = Math.round(base * factor);
  const low   = Math.max(0,   Math.round(mid - 15));
  const high  = Math.min(400, Math.round(mid + 15));
  return `${low}–${high}`;
}

/**
 * Predict WAEC/NECO grade — INTERNAL USE ONLY.
 * Never render in student UI.
 */
function predictWAEC(masteryLevel) {
  if (masteryLevel === null || masteryLevel === undefined) return null;
  if (masteryLevel >= 0.75) return 'A1';
  if (masteryLevel >= 0.70) return 'B2';
  if (masteryLevel >= 0.65) return 'B3';
  if (masteryLevel >= 0.60) return 'B4';
  if (masteryLevel >= 0.50) return 'C5';
  if (masteryLevel >= 0.40) return 'D7';
  if (masteryLevel >= 0.30) return 'E8';
  return 'F9';
}

/* ── MASTERY CALCULATION ── */

/**
 * calcMastery(accuracyAvg, attempts)
 * M = (accuracy × 0.7) + (min(attempts/50, 1) × 0.3)
 * Returns 0–1. Returns null if accuracy is null (NIL state).
 */
function calcMastery(accuracyAvg, attempts = 0) {
  if (accuracyAvg === null || accuracyAvg === undefined) return null;
  const acc  = Math.min(100, Math.max(0, accuracyAvg)) / 100;
  const vol  = Math.min(attempts / 50, 1);
  return parseFloat((acc * 0.7 + vol * 0.3).toFixed(3));
}

/**
 * Returns true if mastery < 0.50 (drill mode — hide timer).
 */
function isDrillMode(masteryLevel) {
  if (masteryLevel === null || masteryLevel === undefined) return true;
  return masteryLevel < 0.50;
}

/* ── ADAPTIVE PYRAMID ── */

/**
 * getSkillGrade(accuracyAvg) → 1, 2, or 3
 * 3 = Standard (exam-level) ≥60%
 * 2 = Intermediate 40–59%
 * 1 = Foundational <40%
 */
function getSkillGrade(accuracyAvg) {
  if (accuracyAvg === null || accuracyAvg === undefined) return 3; // Default to standard
  if (accuracyAvg >= 60) return 3;
  if (accuracyAvg >= 40) return 2;
  return 1;
}

/**
 * applyAdaptivePyramid(topicId, accuracyAvg, attemptsAtGrade1)
 * Updates topic_mastery and profile, shows banners.
 * Runs even in CBT-only mode (silently).
 */
async function applyAdaptivePyramid(topicId, accuracyAvg, attemptsAtGrade1 = 0) {
  if (!currentUser || !currentProfile) return;

  const grade   = getSkillGrade(accuracyAvg);
  const mastery = calcMastery(accuracyAvg);

  /* Save to topic_mastery */
  await sb.from('topic_mastery')
    .upsert({
      user_id: currentUser.id,
      topic_id: topicId,
      accuracy_avg: accuracyAvg,
      mastery_level: mastery,
      grade_level: grade,
      status: mastery === null ? 'NIL' : mastery >= 0.75 ? 'MASTERED' : 'IN_PROGRESS',
      last_studied: new Date().toISOString(),
    }, { onConflict: 'user_id,topic_id' });

  /* Save grade to profile */
  await sb.from('profiles')
    .update({ current_skill_level: grade })
    .eq('id', currentUser.id);
  if (currentProfile) currentProfile.current_skill_level = grade;

  /* Show banner — only in drill mode */
  if (getStudyMode() !== 'cbt_only') {
    showGradeBanner(grade, topicId);
  }

  /* Elementary redirect: Grade 1 with 3+ attempts still failing */
  if (grade === 1 && attemptsAtGrade1 >= 3 && accuracyAvg < 40) {
    showElementaryRedirect(topicId);
  }

  /* Update SmartPath queue */
  await updateSmartPathQueue();
}

/**
 * Show motivational grade banner — never says "Grade 1/2/3".
 */
function showGradeBanner(grade, topicId) {
  const messages = {
    3: { icon: '💪', text: "You're at exam-ready level — keep it up!", cls: 'fill-green' },
    2: { icon: '📈', text: "You're building strong foundations. Keep practising!",  cls: 'fill-orange' },
    1: { icon: '🎯', text: "You're in focused reinforcement mode — keep going!",    cls: 'fill-blue' },
  };
  const m = messages[grade] || messages[3];
  const container = document.getElementById('adaptive-banner-slot');
  if (!container) return;
  container.innerHTML = `
    <div class="adaptive-banner">
      <span class="adaptive-banner-icon">${m.icon}</span>
      <div>
        <div style="font-weight:700;margin-bottom:4px">${m.text}</div>
        <div style="font-size:.85rem;color:var(--muted)">Topic: ${topicId.replace(/-/g,' ')}</div>
      </div>
    </div>`;
  container.style.display = 'block';
  setTimeout(() => { container.style.display = 'none'; }, 6000);
}

/**
 * Show elementary.ueschool.info redirect card.
 */
function showElementaryRedirect(topicId) {
  const container = document.getElementById('adaptive-banner-slot');
  if (!container) return;
  container.innerHTML = `
    <div class="elementary-card">
      <div style="font-weight:700;font-size:1rem;margin-bottom:8px">🏫 Try Our Elementary Version</div>
      <p style="font-size:.88rem;color:var(--muted);margin-bottom:14px">This topic has some foundational concepts that may help before continuing here.</p>
      <a href="https://elementary.ueschool.info/${topicId}" target="_blank" class="btn btn-warning btn-sm">Visit Elementary Site →</a>
    </div>`;
  container.style.display = 'block';
}

/**
 * Show Teacher Marketplace card.
 */
function showTeacherMarketplace(topicId, weaknessReport) {
  const container = document.getElementById('adaptive-banner-slot');
  if (!container) return;
  container.innerHTML = `
    <div class="teacher-card">
      <div style="font-weight:700;font-size:1rem;margin-bottom:8px">👨‍🏫 Hire a Live Tutor</div>
      <p style="font-size:.88rem;color:var(--muted);margin-bottom:14px">Struggling with ${topicId.replace(/-/g,' ')}? Get personalised help from a qualified tutor.</p>
      <a href="/tutors.html" class="btn btn-success btn-sm">Find a Tutor →</a>
    </div>`;
  container.style.display = 'block';
}

/* ── SMARTPATH ── */

/**
 * shouldRecommendTopic(row) — returns true if topic needs attention.
 */
function shouldRecommendTopic(topicMasteryRow) {
  if (!topicMasteryRow) return false;
  if (topicMasteryRow.accuracy_avg === null) return true; // Not started
  return (topicMasteryRow.mastery_level || 0) < 0.60;
}

/**
 * recommendVideoForTopic(topicId, grade) — returns lesson iframe path.
 */
function recommendVideoForTopic(topicId, grade = 3) {
  const base = `/lessons/${topicId}`;
  // Grade-specific variants exist only when the file is present.
  // The path is constructed correctly; classroom.html falls back to the
  // standard index.html if the grade subfolder returns a 404.
  // TODO §36: create grade1/ and grade2/ sub-folders per topic to activate branching.
  if (grade === 1) return `${base}/grade1/index.html`;
  if (grade === 2) return `${base}/grade2/index.html`;
  return `${base}/index.html`;
}

/**
 * updateSmartPathQueue — reads topic_mastery, finds weak topics,
 * writes to profiles.smartpath_queue.
 */
async function updateSmartPathQueue() {
  if (!currentUser || !currentProfile) return;
  const subjects = getExamSubjects();
  if (!subjects.length) return;

  const { data: rows } = await sb
    .from('topic_mastery')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('mastery_level', { ascending: true, nullsFirst: true });

  if (!rows) return;

  const queue = rows
    .filter(r => shouldRecommendTopic(r))
    .slice(0, 6)
    .map(r => ({
      topicId: r.topic_id,
      grade: r.grade_level || 3,
      mastery: r.mastery_level,
      status: r.status,
      lessonPath: recommendVideoForTopic(r.topic_id, r.grade_level || 3),
    }));

  await sb.from('profiles')
    .update({ smartpath_queue: queue })
    .eq('id', currentUser.id);
  if (currentProfile) currentProfile.smartpath_queue = queue;
}

/* ── COMMITMENT SCORE ── */

/**
 * calcCommitmentScore(usageLogs) — returns 0–100 score.
 * Used in report-view.html only.
 */
function calcCommitmentScore(usageLogs) {
  if (!usageLogs || !usageLogs.length) return 0;
  let score = 0;
  const actionWeights = {
    drill_completed: 10,
    video_watched:   8,
    drill_started:   3,
    page_load:       1,
    payment_made:    5,
  };
  for (const log of usageLogs) {
    score += actionWeights[log.action] || 0;
  }
  /* Bonus for streaks — check last 7 days */
  const now = Date.now();
  const recentDays = new Set(
    usageLogs
      .filter(l => (now - new Date(l.ts)) < 7 * 24 * 3600 * 1000)
      .map(l => new Date(l.ts).toDateString())
  );
  score += recentDays.size * 5;
  return Math.min(100, score);
}

/* ── MASTERY LABEL HELPER ── */
/**
 * Returns a student-facing motivational label for a mastery level.
 * Never returns WAEC/NECO grade letters.
 */
function getMasteryLabel(masteryLevel) {
  if (masteryLevel === null || masteryLevel === undefined) return 'Not Started';
  if (masteryLevel >= 0.75) return 'On Track';
  if (masteryLevel >= 0.50) return 'Building Up';
  if (masteryLevel >= 0.30) return 'Needs Attention';
  return 'Needs Attention';
}

/**
 * Returns CSS fill class for a mastery level.
 */
function getMasteryFillClass(masteryLevel) {
  if (masteryLevel === null || masteryLevel === undefined) return 'fill-grey';
  if (masteryLevel >= 0.60) return 'fill-green';
  if (masteryLevel >= 0.40) return 'fill-orange';
  return 'fill-blue';
}
