/* â”€â”€ UltimateEdge School â€” ai-engine.js v4.1 â”€â”€ */
/* Mastery calc Â· score prediction Â· adaptive pyramid Â· SmartPath */

// â”€â”€â”€ MASTERY CALCULATION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * M = (accuracy_avg Ã— 0.7) + (min(attempts / 50, 1) Ã— 0.3)
 * Returns 0â€“1. NULL accuracy_avg â†’ returns null (NIL).
 */
function calcMastery(accuracyAvg, attempts) {
  if (accuracyAvg == null) return null;
  const acc = Math.min(Math.max(accuracyAvg / 100, 0), 1);
  const vol = Math.min((attempts || 0) / 50, 1);
  return parseFloat((acc * 0.7 + vol * 0.3).toFixed(4));
}
window.calcMastery = calcMastery;

// â”€â”€â”€ SKILL GRADE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * Returns 1, 2, or 3 based on accuracy percentage (0â€“100).
 * Grade 3 = exam-ready (â‰¥60%), Grade 2 = intermediate (40â€“59%), Grade 1 = foundational (<40%)
 */
function getSkillGrade(accuracyPct) {
  if (accuracyPct == null) return 3; // Default NIL students to grade 3 (standard) until data
  if (accuracyPct >= 60) return 3;
  if (accuracyPct >= 40) return 2;
  return 1;
}
window.getSkillGrade = getSkillGrade;

// â”€â”€â”€ SCORE PREDICTION â€” JAMB â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * Returns a range string like "265â€“285".
 * @param {number} masteryValue  0â€“1 combined mastery (from calcMastery)
 * @param {number} [avgTimeSecs] Average seconds per question (for speed factor)
 */
function predictJAMB(masteryValue, avgTimeSecs) {
  if (masteryValue == null) return 'â€” ';
  const speedFactor = !avgTimeSecs ? 1
    : avgTimeSecs < 45 ? 1.05
    : avgTimeSecs > 65 ? 0.90
    : 1.00;
  const raw = Math.round(masteryValue * 400 * speedFactor);
  const lo  = Math.max(0,   Math.min(400, raw - 15));
  const hi  = Math.max(0,   Math.min(400, raw + 15));
  return `${lo}â€“${hi}`;
}
window.predictJAMB = predictJAMB;

// â”€â”€â”€ SCORE PREDICTION â€” WAEC / NECO (INTERNAL ONLY â€” NEVER SHOWN TO STUDENTS) â”€
/**
 * Returns a grade letter. FOR ALGORITHM AND REPORT-VIEW USE ONLY.
 * @param {number} masteryValue  0â€“1
 */
function predictWAEC(masteryValue) {
  if (masteryValue == null) return 'N/A';
  if (masteryValue >= 0.75) return 'A1';
  if (masteryValue >= 0.70) return 'B2';
  if (masteryValue >= 0.65) return 'B3';
  if (masteryValue >= 0.60) return 'B4';
  if (masteryValue >= 0.50) return 'C5';
  if (masteryValue >= 0.40) return 'D7';
  if (masteryValue >= 0.30) return 'E8';
  return 'F9';
}
window.predictWAEC = predictWAEC;

// â”€â”€â”€ DRILL MODE DECISION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * Returns true if the student should be in Drill Mode (timer hidden).
 * Only applicable when study_mode = 'drill'. CBT-only students always see the timer.
 */
function isDrillMode(masteryLevel) {
  if (typeof getStudyMode === 'function' && getStudyMode() === 'cbt_only') return false;
  return masteryLevel == null || masteryLevel < 0.50;
}
window.isDrillMode = isDrillMode;

// â”€â”€â”€ ADAPTIVE PYRAMID â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * Called after every session ends.
 * Saves grade level to Supabase, shows grade change banner if needed,
 * redirects to elementary site after 3+ failed Grade 1 attempts.
 *
 * @param {string} topicId
 * @param {number} accuracyPct  0â€“100
 * @param {number} attemptsAtGrade1  from topic_mastery row
 */
async function applyAdaptivePyramid(topicId, accuracyPct, attemptsAtGrade1) {
  const newGrade = getSkillGrade(accuracyPct);

  // Update in DB (silent â€” student never sees grade number)
  if (typeof sb !== 'undefined' && typeof currentUser !== 'undefined' && currentUser) {
    await sb.from('topic_mastery')
      .update({ grade_level: newGrade })
      .eq('user_id', currentUser.id)
      .eq('topic_id', topicId);
  }

  // Show motivational banner only in drill mode
  if (typeof getStudyMode === 'function' && getStudyMode() !== 'cbt_only') {
    showGradeBanner(newGrade, topicId);
  }

  // Elementary redirect: stuck at Grade 1 for 3+ sessions
  if (newGrade === 1 && attemptsAtGrade1 >= 3) {
    showElementaryRedirect(topicId);
  }
}
window.applyAdaptivePyramid = applyAdaptivePyramid;

// â”€â”€â”€ GRADE BANNER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * Shows a motivational banner after a session.
 * NEVER mentions Grade 1/2/3 or WAEC letter grades to the student.
 */
function showGradeBanner(grade, topicId) {
  const msgs = {
    3: { emoji: 'ðŸ”¥', text: "You're at exam-ready level on this topic! Keep it up.", color: 'var(--accent2)' },
    2: { emoji: 'ðŸ“ˆ', text: "You're building strong foundations. A few more sessions and you'll be exam-ready.", color: 'var(--accent)' },
    1: { emoji: 'ðŸ’ª', text: "You're in focused reinforcement mode â€” every attempt makes you stronger.", color: 'var(--warning)' },
  };
  const m = msgs[grade] || msgs[3];

  // Remove existing banner if any
  const existing = document.getElementById('adaptive-banner');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.id = 'adaptive-banner';
  banner.className = 'adaptive-banner';
  banner.style.borderColor = m.color;
  banner.innerHTML = `
    <span style="font-size:1.5rem">${m.emoji}</span>
    <p style="margin:0;flex:1">${m.text}</p>
    <button onclick="this.parentElement.remove()"
      style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:var(--muted)">Ã—</button>
  `;
  document.body.insertAdjacentElement('afterbegin', banner);

  setTimeout(() => banner.remove(), 8000);
}
window.showGradeBanner = showGradeBanner;

// â”€â”€â”€ ELEMENTARY REDIRECT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function showElementaryRedirect(topicId) {
  const existing = document.getElementById('elementary-card');
  if (existing) return;

  const card = document.createElement('div');
  card.id = 'elementary-card';
  card.className = 'elementary-card card card-body';
  card.innerHTML = `
    <div style="font-size:2rem;margin-bottom:10px">ðŸ«</div>
    <h3 style="font-family:var(--font-head);font-size:1.5rem;margin-bottom:8px">Let's build the foundation first</h3>
    <p style="color:var(--muted);margin-bottom:16px;line-height:1.7">
      This topic needs a stronger base before exam-level practice. We've prepared a special version
      that will get you there faster â€” no pressure, just progress.
    </p>
    <a href="https://elementary.ultimateedge.info/${topicId}" target="_blank" class="btn btn-primary btn-lg">
      Open Foundation Lessons â†’
    </a>
    <button class="btn btn-outline" style="margin-left:10px" onclick="this.parentElement.remove()">
      Keep Practising Here
    </button>
  `;

  // Insert after the results screen
  const results = document.getElementById('results-screen') || document.querySelector('main');
  if (results) results.insertAdjacentElement('afterend', card);
  else document.body.appendChild(card);
}
window.showElementaryRedirect = showElementaryRedirect;

// â”€â”€â”€ TEACHER MARKETPLACE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function showTeacherMarketplace(topicId, weaknessReport) {
  const card = document.createElement('div');
  card.className = 'teacher-card card card-body';
  card.innerHTML = `
    <div style="font-size:2rem;margin-bottom:10px">ðŸ‘¨â€ðŸ«</div>
    <h3 style="font-family:var(--font-head);font-size:1.5rem;margin-bottom:8px">Book a Live Tutor</h3>
    <p style="color:var(--muted);margin-bottom:16px;line-height:1.7">
      Sometimes you need a human to explain it. Connect with a verified UltimateEdge tutor
      for 1-on-1 help on this topic.
    </p>
    <a href="tutors.html?topic=${topicId}" class="btn btn-primary">Find a Tutor</a>
    <button class="btn btn-outline" style="margin-left:10px" onclick="this.parentElement.remove()">
      Dismiss
    </button>
  `;
  document.body.appendChild(card);
}
window.showTeacherMarketplace = showTeacherMarketplace;

// â”€â”€â”€ VIDEO RECOMMENDATION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * Returns the lesson URL to serve for a topic based on grade level.
 * Called silently even in CBT-only mode.
 */
function recommendVideoForTopic(topicId, grade) {
  const base = `lessons/${topicId}`;
  if (grade === 1) return `${base}/grade1/index.html`;
  if (grade === 2) return `${base}/grade2/index.html`;
  return `${base}/index.html`;
}
window.recommendVideoForTopic = recommendVideoForTopic;

// â”€â”€â”€ SMARTPATH QUEUE UPDATE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * After a session, recalculate SmartPath recommendations.
 * Runs silently regardless of study_mode.
 * Updates profiles.smartpath_queue with top-5 weakest topics that have been practised.
 */
async function updateSmartPathQueue(subjectFilter) {
  if (!currentUser) return;

  const query = sb.from('topic_mastery')
    .select('topic_id, subject, accuracy_avg, mastery_level, grade_level, status')
    .eq('user_id', currentUser.id)
    .not('accuracy_avg', 'is', null)  // Only topics with at least one session
    .order('mastery_level', { ascending: true });

  // Filter to student's exam subjects if set
  const subjects = getExamSubjects();
  if (subjects.length > 0) {
    query.in('subject', subjects);
  }

  const { data: rows } = await query.limit(20);
  if (!rows || rows.length === 0) return;

  const queue = rows
    .slice(0, 5)
    .map(r => ({
      topic_id: r.topic_id,
      topic_name: formatTopicName(r.topic_id),
      subject: r.subject,
      mastery_level: r.mastery_level,
      grade_level: r.grade_level,
      lesson_url: recommendVideoForTopic(r.topic_id, r.grade_level),
    }));

  await sb.from('profiles')
    .update({ smartpath_queue: queue })
    .eq('id', currentUser.id);

  if (currentProfile) currentProfile.smartpath_queue = queue;
}
window.updateSmartPathQueue = updateSmartPathQueue;

/**
 * Returns true if a topic_mastery row should appear in SmartPath recommendations.
 */
function shouldRecommendTopic(row) {
  if (!row || row.accuracy_avg == null) return false;
  return row.mastery_level == null || row.mastery_level < 0.60;
}
window.shouldRecommendTopic = shouldRecommendTopic;

// â”€â”€â”€ COMMITMENT SCORE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * Converts usage_logs array into a 0â€“100 score for report-view.html.
 */
function calcCommitmentScore(usageLogs) {
  if (!usageLogs || usageLogs.length === 0) return 0;

  const drills    = usageLogs.filter(l => l.action === 'drill_completed').length;
  const videos    = usageLogs.filter(l => l.action === 'video_watched').length;
  const logins    = new Set(usageLogs.filter(l => l.action === 'page_load')
                      .map(l => new Date(l.ts).toDateString())).size;

  // Score out of 100: drills worth 40 pts, videos 30 pts, active days 30 pts
  const drillScore = Math.min(drills / 30, 1) * 40;
  const videoScore = Math.min(videos / 20, 1) * 30;
  const loginScore = Math.min(logins / 30, 1) * 30;

  return Math.round(drillScore + videoScore + loginScore);
}
window.calcCommitmentScore = calcCommitmentScore;

// â”€â”€â”€ HELPERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function formatTopicName(topicId) {
  return (topicId || '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}
window.formatTopicName = formatTopicName;
