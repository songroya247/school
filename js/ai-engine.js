// ============================================================
// UltimateEdge School â€” /js/ai-engine.js  (v3.1)
// The Brain. Load AFTER auth.js.
// Exposes: calcMastery(), predictJAMB(), predictWAEC(),
//          isDrillMode(), getSkillGrade(), applyAdaptivePyramid(),
//          calcCommitmentScore(), showTeacherMarketplace()
// ============================================================

// â”€â”€ 1. MASTERY CALCULATION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// M = (accuracy% Ã— 0.7) + (min(attempts/50, 1) Ã— 0.3)
// Returns 0.0 to 1.0.  Returns null if accuracy is null (NIL).
function calcMastery(accuracyPercent, attempts) {
  if (accuracyPercent == null) return null;
  const acc    = Math.max(0, Math.min(100, accuracyPercent)) / 100;
  const vol    = Math.min((attempts || 0) / 50, 1);
  return parseFloat(((acc * 0.7) + (vol * 0.3)).toFixed(4));
}

// â”€â”€ 2. DRILL MODE vs EXAM MODE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// mastery < 0.50 â†’ Drill Mode (timer hidden)
// mastery â‰¥ 0.50 â†’ Exam Mode  (timer shown)
function isDrillMode(masteryLevel) {
  if (masteryLevel == null) return true; // NIL users always start in Drill Mode
  return masteryLevel < 0.50;
}

// â”€â”€ 3. ADAPTIVE PYRAMID â€” Grade 1/2/3 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Based on last 20 questions for a specific topic
function getSkillGrade(accuracyPercent) {
  if (accuracyPercent == null) return 3; // default
  if (accuracyPercent >= 60) return 3;   // Standard
  if (accuracyPercent >= 40) return 2;   // Intermediate
  return 1;                              // Foundational
}

// â”€â”€ 4. JAMB SCORE PREDICTION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// JAMB is out of 400. We estimate from overall accuracy.
// Returns a range string like "265â€“295"
function predictJAMB(accuracyPercent) {
  if (accuracyPercent == null) return 'â€”';
  const raw  = Math.round(accuracyPercent * 4);
  const low  = Math.max(0,   raw - 15);
  const high = Math.min(400, raw + 15);
  return low + 'â€“' + high;
}

// JAMB with speed factor (for Triple-Threat on dashboard)
function predictJAMBWithSpeed(avgAccuracy, avgSpeedSeconds) {
  if (avgAccuracy == null) return 'â€”';
  const raw         = avgAccuracy * 4;
  let   speedFactor = 1.0;
  if      (avgSpeedSeconds < 45) speedFactor = 1.05;
  else if (avgSpeedSeconds > 65) speedFactor = 0.90;
  const adjusted = Math.round(raw * speedFactor);
  const low      = Math.max(0,   adjusted - 15);
  const high     = Math.min(400, adjusted + 15);
  return low + 'â€“' + high;
}

// â”€â”€ 5. WAEC/NECO GRADE PREDICTION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function predictWAEC(accuracyPercent) {
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
}

// Alias â€” same logic for NECO
const predictNECO = predictWAEC;

// â”€â”€ 6. APPLY ADAPTIVE PYRAMID â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Run after every drill session ends.
// Updates profile + topic_mastery grade, shows appropriate banners.
async function applyAdaptivePyramid(topicId, accuracyAvg, attemptsAtGrade1) {
  if (!currentUser || !sb) return;

  const newGrade = getSkillGrade(accuracyAvg);

  // Update topic_mastery grade
  await sb.from('topic_mastery').upsert({
    user_id:   currentUser.id,
    topic_id:  topicId,
    grade_level: newGrade,
    attempts_at_grade1: newGrade === 1
      ? (attemptsAtGrade1 || 0) + 1
      : (attemptsAtGrade1 || 0),
    last_studied: new Date().toISOString()
  }, { onConflict: 'user_id,topic_id' });

  // Update overall skill level on profile
  await sb.from('profiles')
    .update({ current_skill_level: newGrade })
    .eq('id', currentUser.id);
  if (currentProfile) currentProfile.current_skill_level = newGrade;

  // Show appropriate banner
  const totalGrade1Attempts = newGrade === 1 ? (attemptsAtGrade1 || 0) + 1 : 0;

  if (newGrade === 1 && totalGrade1Attempts >= 3 && accuracyAvg < 40) {
    showElementaryRedirect(topicId);
  } else if (newGrade < 3) {
    showGradeBanner(newGrade, topicId);
  }
}

// â”€â”€ 7. GRADE BANNER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function showGradeBanner(grade, topicId) {
  const existing = document.getElementById('adaptive-banner');
  if (existing) existing.remove();

  const messages = {
    1: {
      title: 'ðŸ”¬ Foundational Mode Activated',
      body:  'We\'ve adjusted your materials to build a rock-solid foundation. Master these and you\'ll be unstoppable.',
      cls:   'adaptive-banner--grade1'
    },
    2: {
      title: 'ðŸ“˜ Intermediate Level',
      body:  'We\'ve switched to Intermediate materials â€” more worked examples and step-by-step breakdowns.',
      cls:   'adaptive-banner--grade2'
    }
  };

  const msg    = messages[grade];
  if (!msg) return;

  const banner = document.createElement('div');
  banner.id    = 'adaptive-banner';
  banner.className = `adaptive-banner ${msg.cls}`;
  banner.innerHTML = `
    <div class="adaptive-banner__icon">${grade === 1 ? 'ðŸŒ±' : 'ðŸ“–'}</div>
    <div class="adaptive-banner__text">
      <strong>${msg.title}</strong>
      <p>${msg.body}</p>
    </div>
    <button class="adaptive-banner__close" onclick="this.parentElement.remove()">âœ•</button>
  `;
  document.body.appendChild(banner);

  // Auto-dismiss after 8 seconds
  setTimeout(() => banner.remove(), 8000);
}

// â”€â”€ 8. ELEMENTARY REDIRECT CARD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function showElementaryRedirect(topicId) {
  const existing = document.getElementById('elementary-card');
  if (existing) return; // don't show twice

  const card    = document.createElement('div');
  card.id       = 'elementary-card';
  card.className = 'elementary-card';
  card.innerHTML = `
    <div class="elementary-card__icon">ðŸŒŸ</div>
    <div class="elementary-card__body">
      <h3>Let's Strengthen the Basics First</h3>
      <p>You've put in real effort on this topic. Sometimes the best move is to go back to absolute basics â€” that's not a setback, it's strategy.</p>
      <div class="elementary-card__actions">
        <a href="https://elementary.ultimateedge.info/${topicId}"
           class="btn btn-primary" target="_blank">
          Visit Elementary Level â†’
        </a>
        <button class="btn btn-outline"
                onclick="document.getElementById('elementary-card').remove()">
          I'll Keep Trying Here
        </button>
      </div>
    </div>
  `;

  // Insert after nav
  const nav = document.querySelector('nav, .ue-nav');
  if (nav) nav.insertAdjacentElement('afterend', card);
  else document.body.prepend(card);
}

// â”€â”€ 9. TEACHER MARKETPLACE CARD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function showTeacherMarketplace(topicId, weaknessReport = []) {
  const existing = document.getElementById('teacher-card');
  if (existing) return;

  const reportHTML = weaknessReport.length
    ? weaknessReport.map(t => `<li>${t.topic}: ${t.accuracy}% accuracy</li>`).join('')
    : '<li>Multiple topics need attention</li>';

  const card    = document.createElement('div');
  card.id       = 'teacher-card';
  card.className = 'teacher-card';
  card.innerHTML = `
    <div class="teacher-card__icon">ðŸ‘¨â€ðŸ«</div>
    <div class="teacher-card__body">
      <h3>Would a Live Teacher Help?</h3>
      <p>Based on your performance, a tutor could make a big difference. Here's your weakness summary:</p>
      <ul class="teacher-card__report">${reportHTML}</ul>
      <div class="teacher-card__actions">
        <a href="/tutors.html" class="btn btn-warning">Hire a Live Tutor â†’</a>
        <button class="btn btn-outline"
                onclick="document.getElementById('teacher-card').remove()">
          No Thanks
        </button>
      </div>
    </div>
  `;
  const nav = document.querySelector('nav, .ue-nav');
  if (nav) nav.insertAdjacentElement('afterend', card);
  else document.body.prepend(card);
}

// â”€â”€ 10. COMMITMENT SCORE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Calculates a score from the usage_logs JSONB array
const COMMITMENT_WEIGHTS = {
  page_view:        0.5,
  video_started:    1,
  video_completed:  3,
  drill_attempted:  2,
  drill_completed:  3,
  login_streak:     2
};

function calcCommitmentScore(usageLogs) {
  if (!usageLogs || !usageLogs.length) return 0;
  return usageLogs.reduce((total, log) => {
    return total + (COMMITMENT_WEIGHTS[log.action] || 0);
  }, 0);
}

// â”€â”€ 11. SMARTPATH RECOMMENDATIONS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Returns topics where mastery < 0.60, sorted by urgency (lowest first)
function getSmartPath(topicMasteryRows, limit = 5) {
  return topicMasteryRows
    .filter(row => row.mastery_level == null || row.mastery_level < 0.60)
    .sort((a, b) => {
      const ma = a.mastery_level ?? -1;
      const mb = b.mastery_level ?? -1;
      return ma - mb; // lowest mastery first
    })
    .slice(0, limit);
}

// â”€â”€ 12. MASTERY STATUS LABEL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function getMasteryLabel(masteryLevel) {
  if (masteryLevel == null)        return { label: 'NIL',         cls: 'status-nil'    };
  if (masteryLevel >= 0.75)        return { label: 'Mastered',    cls: 'status-good'   };
  if (masteryLevel >= 0.50)        return { label: 'In Progress', cls: 'status-warn'   };
  return                                  { label: 'Needs Work',  cls: 'status-danger' };
}

// â”€â”€ 13. NIL DISPLAY HELPER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Use in any template to render mastery safely without showing "0%"
function renderMasteryDisplay(masteryLevel, accuracyAvg) {
  if (masteryLevel == null || accuracyAvg == null) {
    return '<span class="status-nil">NIL</span>';
  }
  const pct = Math.round(accuracyAvg);
  const { label, cls } = getMasteryLabel(masteryLevel);
  return `
    <span class="mastery-pct">${pct}%</span>
    <span class="status-pill ${cls}">${label}</span>
  `;
}
