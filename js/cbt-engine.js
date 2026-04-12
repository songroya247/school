// CBT Engine – handles questions, logging, offline sync, adaptive triggers
let currentSession = {
  mode: 'drill', // 'drill' or 'mock'
  topicId: null,
  questions: [],
  answers: [],
  startTime: null,
  timerInterval: null,
  currentIndex: 0
};

let offlineQueue = JSON.parse(localStorage.getItem('queued_logs') || '[]');

// Sync offline logs when online
window.addEventListener('online', async () => {
  if (offlineQueue.length) {
    const { error } = await sb.from('response_logs').insert(offlineQueue);
    if (!error) {
      localStorage.removeItem('queued_logs');
      offlineQueue = [];
      toast('Offline answers synced!');
    }
  }
});

async function recordResponse(question, isCorrect, timeSpent) {
  if (!currentUser) return;
  const entry = {
    user_id: currentUser.id,
    topic_id: currentSession.topicId,
    is_correct: isCorrect,
    time_spent: timeSpent,
    grade_at_time: currentProfile?.current_skill_level || 3
  };
  if (navigator.onLine) {
    await sb.from('response_logs').insert(entry);
  } else {
    offlineQueue.push(entry);
    localStorage.setItem('queued_logs', JSON.stringify(offlineQueue));
    toast('Saved offline – will sync when connection returns.');
  }
  // Award XP for correct
  if (isCorrect) addXP(10, 'Correct answer');
  // Update topic mastery after each response
  await updateTopicMastery(currentSession.topicId);
}

async function updateTopicMastery(topicId) {
  // Fetch last 50 responses for this topic
  const { data: logs } = await sb
    .from('response_logs')
    .select('is_correct')
    .eq('user_id', currentUser.id)
    .eq('topic_id', topicId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (!logs || logs.length === 0) return;
  const total = logs.length;
  const correct = logs.filter(l => l.is_correct).length;
  const accuracyAvg = (correct / total) * 100;
  const mastery = calcMastery(accuracyAvg, total);
  await sb.from('topic_mastery').upsert({
    user_id: currentUser.id,
    topic_id: topicId,
    accuracy_avg: accuracyAvg,
    mastery_level: mastery,
    last_studied: new Date().toISOString()
  });
  // Also update profile's overall accuracy if needed (optional)
  if (currentProfile.accuracy_avg === null) {
    await sb.from('profiles').update({ accuracy_avg: accuracyAvg, status: 'ACTIVE' }).eq('id', currentUser.id);
    currentProfile.accuracy_avg = accuracyAvg;
  }
  // Trigger adaptive pyramid
  // Get attempts_at_grade1 from topic_mastery
  const { data: topicData } = await sb
    .from('topic_mastery')
    .select('attempts_at_grade1')
    .eq('user_id', currentUser.id)
    .eq('topic_id', topicId)
    .single();
  let attempts = topicData?.attempts_at_grade1 || 0;
  if (accuracyAvg < 40 && currentProfile.current_skill_level === 1) {
    attempts++;
    await sb.from('topic_mastery').update({ attempts_at_grade1: attempts }).eq('user_id', currentUser.id).eq('topic_id', topicId);
  }
  await applyAdaptivePyramid(topicId, accuracyAvg, attempts);
}

// Load questions from JSON (mock)
async function loadQuestions(topicId, count = 10) {
  const res = await fetch('/data/questions.json');
  const all = await res.json();
  const filtered = all.filter(q => q.topic === topicId);
  // Shuffle and take count
  const shuffled = filtered.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

// Render current question in CBT UI
function renderQuestion() {
  const q = currentSession.questions[currentSession.currentIndex];
  if (!q) return;
  const panel = document.getElementById('question-panel');
  panel.innerHTML = `
    <div class="question-text">${q.text}</div>
    <div class="options-grid">
      ${q.options.map((opt, idx) => `<button class="cbt-answer-btn" data-opt="${idx}">${opt}</button>`).join('')}
    </div>
  `;
  document.querySelectorAll('.cbt-answer-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const selected = parseInt(e.currentTarget.dataset.opt);
      const isCorrect = (selected === q.correct);
      const timeSpent = Math.floor((Date.now() - currentSession.startTime) / 1000);
      recordResponse(q, isCorrect, timeSpent);
      // Mark on map
      const mapDot = document.querySelector(`.map-dot[data-qidx="${currentSession.currentIndex}"]`);
      if (mapDot) mapDot.classList.add(isCorrect ? 'correct' : 'wrong');
      // Move to next or finish
      if (currentSession.currentIndex + 1 < currentSession.questions.length) {
        currentSession.currentIndex++;
        currentSession.startTime = Date.now();
        renderQuestion();
      } else {
        endSession();
      }
    });
  });
}

async function startSession(mode, topicId) {
  currentSession.mode = mode;
  currentSession.topicId = topicId;
  currentSession.questions = await loadQuestions(topicId, mode === 'mock' ? 40 : 10);
  currentSession.currentIndex = 0;
  currentSession.startTime = Date.now();
  // Build question map
  const mapDiv = document.getElementById('question-map');
  mapDiv.innerHTML = currentSession.questions.map((_, idx) => `<div class="map-dot" data-qidx="${idx}">${idx+1}</div>`).join('');
  renderQuestion();
  // Timer logic for mock
  if (mode === 'mock') {
    let seconds = 2 * 60 * 60; // 2 hours
    const timerSpan = document.getElementById('timer');
    timerSpan.style.display = 'block';
    currentSession.timerInterval = setInterval(() => {
      seconds--;
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = seconds % 60;
      timerSpan.innerText = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
      if (seconds <= 0) endSession();
    }, 1000);
  } else {
    // Drill mode – hide timer
    document.getElementById('timer').style.display = 'none';
  }
}

async function endSession() {
  if (currentSession.timerInterval) clearInterval(currentSession.timerInterval);
  // Calculate score and save session_scores
  // For simplicity, we skip session_scores in this MVP but you can add later
  toast('Session completed! Mastery updated.');
  // Optionally redirect to dashboard
  setTimeout(() => (window.location.href = 'dashboard.html'), 2000);
}

// Expose for HTML buttons
window.startCBT = startSession;
window.startDrill = (topicId) => startSession('drill', topicId);
window.startMock = (topicId) => startSession('mock', topicId);