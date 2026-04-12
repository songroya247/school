// ============================================================
// UltimateEdge School â€” /js/ai-engine.js  (v3.2)
// Load AFTER auth.js.
// All grade-level decisions are made HERE automatically â€”
// students never see or touch grade selectors.
// ============================================================

// â”€â”€ 1. MASTERY CALCULATION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// M = (accuracy_% Ã— 0.7) + (min(attempts/50,1) Ã— 0.3)
// Returns null when accuracy is null (NIL state â€” never show 0%).
window.calcMastery = function(accuracyPercent, attempts) {
  if (accuracyPercent == null) return null;
  const acc = Math.max(0, Math.min(100, accuracyPercent)) / 100;
  const vol = Math.min((attempts || 0) / 50, 1);
  return parseFloat(((acc * 0.7) + (vol * 0.3)).toFixed(4));
};

// â”€â”€ 2. DRILL MODE vs EXAM MODE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// mastery < 0.50 â†’ timer hidden (lower pressure)
// mastery â‰¥ 0.50 â†’ timer shown (exam conditions)
window.isDrillMode = function(masteryLevel) {
  if (masteryLevel == null) return true; // NIL â†’ always start with no timer
  return masteryLevel < 0.50;
};

// â”€â”€ 3. ADAPTIVE PYRAMID â€” grade from accuracy â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// accuracy >= 60% â†’ Grade 3 (Standard)
// accuracy 40â€“59% â†’ Grade 2 (Intermediate)
// accuracy < 40%  â†’ Grade 1 (Foundational)
window.getSkillGrade = function(accuracyPercent) {
  if (accuracyPercent == null) return 3; // default for NIL users
  if (accuracyPercent >= 60) return 3;
  if (accuracyPercent >= 40) return 2;
  return 1;
};

// â”€â”€ 4. JAMB SCORE PREDICTION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Returns range string like "265â€“295". JAMB scored out of 400.
window.predictJAMB = function(accuracyPercent) {
  if (accuracyPercent == null) return 'â€”';
  const raw  = Math.round(accuracyPercent * 4);
  const low  = Math.max(0,   raw - 15);
  const high = Math.min(400, raw + 15);
  return low + 'â€“' + high;
};

// JAMB with speed factor (used on dashboard Triple-Threat panel)
window.predictJAMBWithSpeed = function(avgAccuracy, avgSpeedSeconds) {
  if (avgAccuracy == null) return 'â€”';
  const raw   = avgAccuracy * 4;
  let   sf    = 1.0;
  if      (avgSpeedSeconds < 45) sf = 1.05;
  else if (avgSpeedSeconds > 65) sf = 0.90;
  const adj  = Math.round(raw * sf);
  const low  = Math.max(0,   adj - 15);
  const high = Math.min(400, adj + 15);
  return low + 'â€“' + high;
};

// â”€â”€ 5. WAEC / NECO GRADE PREDICTION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
window.predictWAEC = function(accuracyPercent) {
  if (accuracyPercent == null) return 'â€”';
  const a = accuracyPercent;
  if (a >= 75) return 'A1';
  if (a >= 70) return 'B2';
  if (a >= 65) return 'B3';
  if (a >= 60) return 'C4';
  if (a >= 55) return 'C5';
  if (a >= 50) return 'C6';
  if (a >= 45) return 'D7';
  if (a >= 40) return 'E8';
  return 'F9';
};
window.predictNECO = window.predictWAEC; // same scale

// â”€â”€ 6. APPLY ADAPTIVE PYRAMID (runs after every session) â”€â”€â”€â”€â”€â”€
// Silently determines the correct grade, updates DB,
// then shows a helpful (never punitive) notification to the student.
window.applyAdaptivePyramid = async function(topicId, accuracyAvg, attemptsAtGrade1) {
  if (!window.currentUser || !window.sb) return;

  const newGrade     = window.getSkillGrade(accuracyAvg);
  const g1Attempts   = newGrade === 1 ? (attemptsAtGrade1 || 0) + 1 : (attemptsAtGrade1 || 0);

  // Persist grade to DB silently
  await window.sb.from('topic_mastery').upsert({
    user_id:            window.currentUser.id,
    topic_id:           topicId,
    grade_level:        newGrade,
    attempts_at_grade1: g1Attempts,
    last_studied:       new Date().toISOString()
  }, { onConflict: 'user_id,topic_id' });

  await window.sb.from('profiles')
    .update({ current_skill_level: newGrade })
    .eq('id', window.currentUser.id);

  if (window.currentProfile) window.currentProfile.current_skill_level = newGrade;

  // Show appropriate notification
  if (newGrade === 1 && g1Attempts >= 3 && accuracyAvg < 40) {
    showElementaryRedirect(topicId);
  } else if (newGrade < 3) {
    showGradeBanner(newGrade);
  }
};

// â”€â”€ 7. GRADE NOTIFICATION BANNER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Shown after session â€” supportive language only, never "you failed"
window.showGradeBanner = function(grade) {
  document.getElementById('adaptive-banner')?.remove();

  const copy = {
    1: { icon:'ðŸŒ±', title:'Foundational Mode', body:'We\'ve adjusted your materials to build a strong foundation. Master these basics and everything else becomes easier.' },
    2: { icon:'ðŸ“–', title:'Intermediate Level', body:'We\'ve switched to more worked examples and step-by-step explanations to help you level up.' }
  };
  const m = copy[grade];
  if (!m) return;

  const el = document.createElement('div');
  el.id    = 'adaptive-banner';
  el.className = 'adaptive-banner adaptive-banner--grade' + grade;
  el.innerHTML = `
    <div class="adaptive-banner__icon">${m.icon}</div>
    <div class="adaptive-banner__text">
      <strong>${m.title}</strong>
      <p>${m.body}</p>
    </div>
    <button class="adaptive-banner__close" onclick="this.parentElement.remove()">âœ•</button>`;

  const main = document.querySelector('.cbt-main, main, .cls-main, body');
  if (main) main.prepend(el);
  setTimeout(() => el.remove(), 9000);
};

// â”€â”€ 8. ELEMENTARY REDIRECT CARD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Shown when: grade=1 AND attemptsAtGrade1 >= 3 AND accuracy < 40%
// Links to elementary.ultimateedge.info/[topic_id]
window.showElementaryRedirect = function(topicId) {
  if (document.getElementById('elementary-card')) return;
  const card = document.createElement('div');
  card.id    = 'elementary-card';
  card.className = 'elementary-card';
  card.innerHTML = `
    <div class="elementary-card__icon">ðŸŒŸ</div>
    <div>
      <h3>Let's Strengthen the Basics First</h3>
      <p>You've put in real effort here. The best move right now is to build a rock-solid foundation on the elementary level â€” that's strategy, not retreat.</p>
      <div class="elementary-card__actions">
        <a href="https://elementary.ultimateedge.info/${topicId}"
           class="btn btn-success" target="_blank" rel="noopener">
          Go to Elementary Level â†’
        </a>
        <button class="btn btn-ghost"
                onclick="document.getElementById('elementary-card').remove()">
          I'll Keep Trying Here
        </button>
      </div>
    </div>`;
  const ref = document.querySelector('.cbt-main, main, body');
  if (ref) ref.prepend(card);
};

// â”€â”€ 9. TEACHER / TUTOR CARD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Links to teachersoffice.ultimateedge.info
window.showTeacherMarketplace = function(topicId, weaknessReport = []) {
  if (document.getElementById('teacher-card')) return;
  const items = weaknessReport.length
    ? weaknessReport.map(t => `<li>${t.topic}: ${Math.round(t.accuracy)}% accuracy</li>`).join('')
    : '<li>Multiple topics need attention</li>';

  const card = document.createElement('div');
  card.id    = 'teacher-card';
  card.className = 'teacher-card';
  card.innerHTML = `
    <div class="teacher-card__icon">ðŸ‘¨â€ðŸ«</div>
    <div>
      <h3>Would a Live Teacher Help?</h3>
      <p>Based on your results, a tutor session could unlock real progress. Here's what needs work:</p>
      <ul class="teacher-card__report">${items}</ul>
      <div class="teacher-card__actions">
        <a href="https://teachersoffice.ultimateedge.info/?topic=${topicId}"
           class="btn btn-warning" target="_blank" rel="noopener">
          Book a Live Tutor â†’
        </a>
        <button class="btn btn-ghost"
                onclick="document.getElementById('teacher-card').remove()">
          No Thanks
        </button>
      </div>
    </div>`;
  const ref = document.querySelector('.cbt-main, main, body');
  if (ref) ref.prepend(card);
};

// â”€â”€ 10. COMMITMENT SCORE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const COMMITMENT_WEIGHTS = {
  page_view: .5, video_started: 1, video_completed: 3,
  drill_attempted: 2, drill_completed: 3, login_streak: 2
};
window.calcCommitmentScore = function(usageLogs) {
  if (!usageLogs?.length) return 0;
  return usageLogs.reduce((t, l) => t + (COMMITMENT_WEIGHTS[l.action] || 0), 0);
};

// â”€â”€ 11. SMARTPATH RECOMMENDATIONS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Topics where mastery < 0.60, sorted lowest first (most urgent)
window.getSmartPath = function(topicMasteryRows, limit = 5) {
  return topicMasteryRows
    .filter(r => r.mastery_level == null || r.mastery_level < 0.60)
    .sort((a, b) => {
      const ma = a.mastery_level ?? -1;
      const mb = b.mastery_level ?? -1;
      return ma - mb;
    })
    .slice(0, limit);
};

// â”€â”€ 12. MASTERY STATUS LABEL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
window.getMasteryLabel = function(masteryLevel) {
  if (masteryLevel == null)   return { label: 'NIL',         cls: 'status-nil'    };
  if (masteryLevel >= 0.75)   return { label: 'Mastered',    cls: 'status-good'   };
  if (masteryLevel >= 0.50)   return { label: 'In Progress', cls: 'status-active' };
  return                             { label: 'Needs Work',  cls: 'status-danger' };
};

// â”€â”€ 13. RENDER MASTERY SAFELY (never shows "0%" for NIL) â”€â”€â”€â”€â”€â”€
window.renderMasteryDisplay = function(masteryLevel, accuracyAvg) {
  if (masteryLevel == null || accuracyAvg == null) {
    return '<span class="status-pill status-nil">NIL</span>';
  }
  const pct           = Math.round(accuracyAvg);
  const { label, cls } = window.getMasteryLabel(masteryLevel);
  return `<span class="text-mono fw-700">${pct}%</span>
          <span class="status-pill ${cls}">${label}</span>`;
};

// â”€â”€ 14. RESOLVE GRADE LESSON URL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Called by classroom.html â€” picks the right subfolder automatically.
// Falls back gracefully: grade3 â†’ grade2 â†’ grade1 â†’ /index.html
window.resolveGradeUrl = async function(topicId, grade) {
  const variants = [grade, grade === 1 ? 1 : grade - 1, 1].filter((v,i,a) => a.indexOf(v) === i);
  for (const g of variants) {
    const url = `/lessons/${topicId}/grade${g}/index.html`;
    try {
      const r = await fetch(url, { method: 'HEAD' });
      if (r.ok) return url;
    } catch (_) {}
  }
  // Final fallback: base index.html
  return `/lessons/${topicId}/index.html`;
};
