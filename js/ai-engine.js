// Unified Mastery Calculation
function calcMastery(accuracyAvg, totalAttempts) {
  if (accuracyAvg === null || accuracyAvg === undefined) return null;
  const acc = accuracyAvg / 100;
  const volume = Math.min(totalAttempts / 50, 1);
  return acc * 0.7 + volume * 0.3;
}

// Adaptive Pyramid – Get Grade (1,2,3) based on accuracy
function getSkillGrade(accuracy) {
  if (accuracy >= 60) return 3;
  if (accuracy >= 40) return 2;
  return 1;
}

// JAMB Prediction (range)
function predictJAMB(accuracy) {
  if (accuracy === null) return '—';
  const raw = Math.round(accuracy * 4);
  const low = Math.max(0, raw - 15);
  const high = Math.min(400, raw + 15);
  return `${low}–${high}`;
}

// WAEC/NECO Grade
function predictWAEC(accuracy) {
  if (accuracy === null) return '—';
  if (accuracy >= 75) return 'A1';
  if (accuracy >= 70) return 'B2';
  if (accuracy >= 65) return 'B3';
  if (accuracy >= 60) return 'C4';
  if (accuracy >= 55) return 'C5';
  if (accuracy >= 50) return 'C6';
  if (accuracy >= 45) return 'D7';
  if (accuracy >= 40) return 'E8';
  return 'F9';
}

// Show adaptive banners
function showGradeBanner(grade, topicId) {
  const banner = document.createElement('div');
  banner.className = `adaptive-banner grade-banner-${grade}`;
  if (grade === 2) banner.innerText = '📘 Switching to Intermediate Level. We\'ve adjusted your materials.';
  else if (grade === 1) banner.innerText = '🌱 Foundational Mode Activated. Master these and you\'ll be unstoppable.';
  else return;
  document.body.prepend(banner);
  setTimeout(() => banner.remove(), 5000);
}

function showElementaryRedirect(topicId) {
  const card = document.createElement('div');
  card.className = 'elementary-card';
  card.innerHTML = `📚 Let's strengthen the basics first. <a href="https://elementary.ultimateedge.info/${topicId}" target="_blank">Go to Elementary Lessons →</a> <button onclick="this.parentElement.remove()">Dismiss</button>`;
  document.body.appendChild(card);
}

function showTeacherMarketplace(topicId, weaknessReport) {
  const card = document.createElement('div');
  card.className = 'teacher-card';
  card.innerHTML = `👩‍🏫 Would a live teacher help? Weakness: ${weaknessReport}. <a href="/tutors.html">Hire a Live Tutor →</a>`;
  document.body.appendChild(card);
}

// Main Adaptive Pyramid logic – call after each session
async function applyAdaptivePyramid(topicId, accuracy, attemptsAtGrade1) {
  if (accuracy === null) return;
  const newGrade = getSkillGrade(accuracy);
  const oldGrade = currentProfile?.current_skill_level || 3;
  if (newGrade !== oldGrade) {
    await sb
      .from('profiles')
      .update({ current_skill_level: newGrade })
      .eq('id', currentUser.id);
    await sb
      .from('topic_mastery')
      .update({ grade_level: newGrade })
      .eq('user_id', currentUser.id)
      .eq('topic_id', topicId);
    showGradeBanner(newGrade, topicId);
  }
  if (newGrade === 1 && attemptsAtGrade1 >= 3 && accuracy < 40) {
    showElementaryRedirect(topicId);
    // Optionally track that we showed it
    trackAction('elementary_redirect_shown', { topic: topicId });
  }
  // Future: if still struggling after 5 more attempts, show teacher card
}

// Drill mode detection (mastery < 0.5 => hide timer)
function isDrillMode(mastery) {
  return mastery === null || mastery < 0.5;
}

// Export to global
window.calcMastery = calcMastery;
window.getSkillGrade = getSkillGrade;
window.predictJAMB = predictJAMB;
window.predictWAEC = predictWAEC;
window.applyAdaptivePyramid = applyAdaptivePyramid;
window.isDrillMode = isDrillMode;
window.showGradeBanner = showGradeBanner;
window.showElementaryRedirect = showElementaryRedirect;
window.showTeacherMarketplace = showTeacherMarketplace;