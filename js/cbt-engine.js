/* ═══════════════════════════════════════════════════════════
   UE School — cbt-engine.js  v4.1
   Runs ONLY on cbt.html.
   Handles: question rendering, answer recording, timer,
   flag-and-review, offline IndexedDB sync, XP, adaptive pyramid.
   ═══════════════════════════════════════════════════════════ */

/* ── SESSION STATE ── */
let cbtSession = {
  questions:     [],
  answers:       {},         // { qIndex: optionIndex }
  flags:         new Set(),  // session-only, not persisted
  currentIndex:  0,
  timeLeft:      7200,       // seconds
  timerInterval: null,
  mode:          'mock',     // 'mock' | 'topic'
  examType:      'JAMB',
  subject:       '',
  topicId:       '',
  gradeLevel:    3,
  startTime:     null,
  qTimers:       {},         // { qIndex: secondsSpent }
  qStartTime:    null,
};

/* ── INDEXEDDB OFFLINE QUEUE ── */
const DB_NAME    = 'ue_offline';
const DB_STORE   = 'queued_logs';
let   idb        = null;

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore(DB_STORE, { autoIncrement: true });
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

async function queueOffline(entry) {
  if (!idb) idb = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).add(entry);
    tx.oncomplete = resolve;
    tx.onerror    = reject;
  });
}

async function flushOfflineQueue() {
  if (!idb) idb = await openIDB();
  if (!navigator.onLine || !currentUser) return;
  const tx    = idb.transaction(DB_STORE, 'readwrite');
  const store = tx.objectStore(DB_STORE);
  const req   = store.getAll();
  req.onsuccess = async () => {
    const items = req.result;
    if (!items.length) return;
    const { error } = await sb.from('response_logs').insert(items.map(i => i.data));
    if (!error) {
      const clear = idb.transaction(DB_STORE, 'readwrite');
      clear.objectStore(DB_STORE).clear();
    }
  };
}

/* Auto-sync when back online */
window.addEventListener('online', flushOfflineQueue);

/* ── RECORD RESPONSE ── */
async function recordResponse({ topicId, isCorrect, timeSpent, gradeLevel, examType }) {
  const entry = {
    user_id:     currentUser?.id,
    topic_id:    topicId,
    exam_type:   examType || cbtSession.examType,
    is_correct:  isCorrect,
    time_spent:  timeSpent,
    grade_level: gradeLevel || cbtSession.gradeLevel,
    created_at:  new Date().toISOString(),
  };

  if (navigator.onLine && currentUser) {
    const { error } = await sb.from('response_logs').insert(entry);
    if (error) await queueOffline({ data: entry });
  } else {
    await queueOffline({ data: entry });
  }
}

/* ── UPDATE TOPIC MASTERY ── */
async function updateTopicMastery(topicId, isCorrect) {
  if (!currentUser) return;

  /* Fetch existing row */
  const { data: existing } = await sb
    .from('topic_mastery')
    .select('*')
    .eq('user_id', currentUser.id)
    .eq('topic_id', topicId)
    .single();

  let attempts   = (existing?.attempts_at_grade1 || 0);
  let totalAns   = 1;
  let correctAns = isCorrect ? 1 : 0;

  if (existing && existing.accuracy_avg !== null) {
    /* Re-weight: new accuracy = running average */
    const prevAccuracy = existing.accuracy_avg;
    /* Estimate previous total from accuracy + volume signal */
    totalAns   = Math.max(1, Math.round((existing.mastery_level - 0.3 * Math.min(attempts / 50, 1)) / 0.7 * 100 / prevAccuracy));
    correctAns = Math.round(prevAccuracy / 100 * totalAns) + (isCorrect ? 1 : 0);
    totalAns   += 1;
  }

  const newAccuracy = Math.round((correctAns / totalAns) * 100);
  const newMastery  = calcMastery(newAccuracy, totalAns);
  const newGrade    = getSkillGrade(newAccuracy);

  if (newGrade === 1) attempts++;

  await sb.from('topic_mastery').upsert({
    user_id:            currentUser.id,
    topic_id:           topicId,
    accuracy_avg:       newAccuracy,
    mastery_level:      newMastery,
    grade_level:        newGrade,
    status:             newMastery >= 0.75 ? 'MASTERED' : 'IN_PROGRESS',
    attempts_at_grade1: attempts,
    last_studied:       new Date().toISOString(),
  }, { onConflict: 'user_id,topic_id' });

  return { accuracy: newAccuracy, mastery: newMastery, grade: newGrade, attempts };
}

/* ── AWARD XP ── */
async function awardXP(isCorrect) {
  if (isCorrect) await addXP(10, '✓ correct answer');
}

/* ── FLAG QUESTION ── */
function flagQuestion(index) {
  if (cbtSession.flags.has(index)) {
    cbtSession.flags.delete(index);
  } else {
    cbtSession.flags.add(index);
  }
  renderQuestion();
  renderMap();
  /* Update flag button */
  const btn = document.getElementById('flag-btn');
  if (btn) {
    btn.classList.toggle('flagged', cbtSession.flags.has(index));
    btn.innerHTML = cbtSession.flags.has(index)
      ? '<span>⚑</span> Flagged'
      : '<span>⚑</span> Flag for Review';
  }
}

/* ── TIME TRACKING PER QUESTION ── */
function startQTimer() {
  cbtSession.qStartTime = Date.now();
}
function stopQTimer() {
  if (!cbtSession.qStartTime) return 0;
  const secs = Math.round((Date.now() - cbtSession.qStartTime) / 1000);
  cbtSession.qTimers[cbtSession.currentIndex] = (cbtSession.qTimers[cbtSession.currentIndex] || 0) + secs;
  cbtSession.qStartTime = null;
  return secs;
}

/* ── START EXAM ── */
function startExam() {
  const mode    = document.getElementById('sel-mode')?.value || 'mock';
  const subject = document.getElementById('sel-subject')?.value || 'Mathematics';
  const examType = document.getElementById('sel-exam-type')?.value || 'JAMB';

  cbtSession.mode      = mode.includes('Mock') ? 'mock' : 'topic';
  cbtSession.subject   = subject.toLowerCase().replace(/\s+/g, '-');
  cbtSession.examType  = examType;
  cbtSession.gradeLevel = currentProfile?.current_skill_level || 3;
  cbtSession.topicId   = cbtSession.subject; // default
  cbtSession.startTime  = Date.now();

  /* Load questions (sample set — in production, query Supabase questions table) */
  cbtSession.questions = generateSampleQuestions(subject, cbtSession.mode === 'mock' ? 40 : 10);
  cbtSession.answers   = {};
  cbtSession.flags     = new Set();
  cbtSession.currentIndex = 0;
  cbtSession.timeLeft  = cbtSession.mode === 'mock' ? 7200 : 600;
  cbtSession.qTimers   = {};

  document.getElementById('setup-screen').style.display  = 'none';
  document.getElementById('exam-screen').style.display   = 'flex';
  document.getElementById('exam-title').textContent = `${subject} — ${cbtSession.mode === 'mock' ? 'Mock Exam' : 'Topic Practice'}`;

  /* Hide timer in drill mode (mastery < 0.50) unless CBT-Only */
  const timerBox = document.getElementById('timer-display');
  const timerHidden = getStudyMode() !== 'cbt_only' && isDrillMode(currentProfile?.mastery_level);
  if (timerBox) timerBox.style.display = timerHidden ? 'none' : '';

  renderQuestion();
  renderMap();
  startQTimer();
  startTimer();

  trackAction('drill_started', { subject, mode: cbtSession.mode, examType });
}

/* ── TIMER ── */
function startTimer() {
  const timerEl = document.getElementById('timer-display');
  cbtSession.timerInterval = setInterval(() => {
    cbtSession.timeLeft--;
    if (timerEl) {
      const h = Math.floor(cbtSession.timeLeft / 3600);
      const m = Math.floor((cbtSession.timeLeft % 3600) / 60);
      const s = cbtSession.timeLeft % 60;
      timerEl.textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;
      if (cbtSession.timeLeft <= 300) timerEl.classList.add('warning');
    }
    if (cbtSession.timeLeft <= 0) submitExam();
  }, 1000);
}

function pad(n) { return String(n).padStart(2, '0'); }

/* ── RENDER QUESTION ── */
function renderQuestion() {
  const q = cbtSession.questions[cbtSession.currentIndex];
  if (!q) return;

  const total = cbtSession.questions.length;
  const idx   = cbtSession.currentIndex;

  document.getElementById('q-counter').textContent = `Question ${idx + 1} of ${total}`;
  document.getElementById('q-number-badge').textContent = `Question ${idx + 1}`;
  document.getElementById('q-text').textContent = q.text;

  /* Flag button */
  const flagBtn = document.getElementById('flag-btn');
  if (flagBtn) {
    flagBtn.classList.toggle('flagged', cbtSession.flags.has(idx));
    flagBtn.innerHTML = cbtSession.flags.has(idx)
      ? '<span>⚑</span> Flagged'
      : '<span>⚑</span> Flag for Review';
  }

  /* Answer options */
  const optsContainer = document.getElementById('q-options');
  optsContainer.innerHTML = '';
  q.opts.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'drill-option' + (cbtSession.answers[idx] === i ? ' selected' : '');
    btn.innerHTML = `<span class="opt-label">${String.fromCharCode(65 + i)}</span><span class="opt-text">${opt}</span>`;
    btn.onclick = () => selectAnswer(i);
    optsContainer.appendChild(btn);
  });

  /* Prev/Next buttons */
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');
  if (prevBtn) prevBtn.disabled = idx === 0;
  if (nextBtn) {
    if (idx === total - 1) {
      nextBtn.textContent = 'Submit ✓';
      nextBtn.onclick = submitExam;
      nextBtn.style.background = 'var(--accent2)';
    } else {
      nextBtn.textContent = 'Next →';
      nextBtn.onclick = () => navQ(1);
      nextBtn.style.background = '';
    }
  }

  /* Live JAMB prediction */
  const answered = Object.keys(cbtSession.answers).length;
  const correct  = Object.entries(cbtSession.answers).filter(([qi, oi]) => cbtSession.questions[qi]?.ans === oi).length;
  const accuracy = answered > 0 ? (correct / answered) * 100 : null;
  const pred     = predictJAMB(accuracy);
  const predEl   = document.getElementById('jamb-pred');
  if (predEl) predEl.textContent = pred;
}

/* ── SELECT ANSWER ── */
async function selectAnswer(optIndex) {
  const timeSpent = stopQTimer();
  const idx       = cbtSession.currentIndex;
  const q         = cbtSession.questions[idx];
  const isCorrect = optIndex === q.ans;

  cbtSession.answers[idx] = optIndex;
  renderQuestion();
  renderMap();

  /* Record response */
  await recordResponse({
    topicId:    q.topicId || cbtSession.topicId,
    isCorrect,
    timeSpent,
    gradeLevel: cbtSession.gradeLevel,
    examType:   cbtSession.examType,
  });

  /* Update mastery */
  await updateTopicMastery(q.topicId || cbtSession.topicId, isCorrect);

  /* Award XP */
  await awardXP(isCorrect);

  /* Auto-advance */
  if (idx < cbtSession.questions.length - 1) {
    setTimeout(() => {
      cbtSession.currentIndex++;
      startQTimer();
      renderQuestion();
      renderMap();
    }, 350);
  }
}

/* ── NAVIGATE QUESTION ── */
function navQ(dir) {
  stopQTimer();
  cbtSession.currentIndex = Math.max(0, Math.min(cbtSession.questions.length - 1, cbtSession.currentIndex + dir));
  startQTimer();
  renderQuestion();
  renderMap();
}

/* ── RENDER QUESTION MAP ── */
function renderMap() {
  const map = document.getElementById('q-map');
  if (!map) return;
  map.innerHTML = '';
  cbtSession.questions.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.className = 'q-dot';
    if (i === cbtSession.currentIndex) dot.classList.add('current');
    else if (cbtSession.flags.has(i)) { dot.classList.add('flagged'); dot.textContent = '⚑'; }
    else if (cbtSession.answers[i] !== undefined) dot.classList.add('answered');
    if (!dot.textContent) dot.textContent = i + 1;
    dot.onclick = () => {
      stopQTimer();
      cbtSession.currentIndex = i;
      startQTimer();
      renderQuestion();
      renderMap();
    };
    map.appendChild(dot);
  });
}

/* ── SUBMIT EXAM ── */
async function submitExam() {
  /* If there are flagged questions, show review screen first */
  if (cbtSession.flags.size > 0) {
    showFlaggedReview();
    return;
  }
  await finalizeSubmit();
}

function showFlaggedReview() {
  const reviewContainer = document.getElementById('flagged-review-section');
  if (!reviewContainer) { finalizeSubmit(); return; }

  const flaggedList = Array.from(cbtSession.flags);
  reviewContainer.innerHTML = `
    <div class="flagged-review">
      <h3>⚑ Review Flagged Questions (${flaggedList.length})</h3>
      <p style="font-size:.85rem;color:var(--muted);margin-bottom:14px">You flagged these questions. Jump to any before final submission.</p>
      ${flaggedList.map(i => `
        <div class="flag-review-item" onclick="jumpToFlagged(${i})">
          <span style="font-family:var(--font-mono);font-weight:700">Q${i + 1}</span>
          <span style="flex:1;font-size:.88rem">${cbtSession.questions[i]?.text?.slice(0, 80)}…</span>
          <span style="color:var(--accent);font-size:.8rem">→ Review</span>
        </div>
      `).join('')}
      <div style="display:flex;gap:12px;margin-top:16px">
        <button class="btn btn-outline" onclick="dismissFlaggedReview()">Continue Reviewing</button>
        <button class="btn btn-warning" onclick="finalizeSubmit()">Submit Anyway</button>
      </div>
    </div>`;
  reviewContainer.style.display = 'block';
  document.getElementById('exam-screen').scrollTop = 0;
}

function jumpToFlagged(index) {
  const reviewContainer = document.getElementById('flagged-review-section');
  if (reviewContainer) reviewContainer.style.display = 'none';
  cbtSession.currentIndex = index;
  renderQuestion();
  renderMap();
}

function dismissFlaggedReview() {
  const reviewContainer = document.getElementById('flagged-review-section');
  if (reviewContainer) reviewContainer.style.display = 'none';
}

async function finalizeSubmit() {
  clearInterval(cbtSession.timerInterval);

  const total    = cbtSession.questions.length;
  const correct  = cbtSession.questions.filter((q, i) => cbtSession.answers[i] === q.ans).length;
  const accuracy = Math.round((correct / total) * 100);
  const timeUsed = (cbtSession.mode === 'mock' ? 7200 : 600) - cbtSession.timeLeft;
  const avgTime  = total > 0 ? Math.round(timeUsed / total) : 0;

  /* Save session score */
  if (currentUser) {
    await sb.from('session_scores').insert({
      user_id:         currentUser.id,
      exam_type:       cbtSession.examType,
      score:           correct,
      total_questions: total,
      accuracy,
      avg_time_per_q:  avgTime,
      grade_level:     cbtSession.gradeLevel,
    });

    /* Apply adaptive pyramid */
    await applyAdaptivePyramid(cbtSession.topicId, accuracy, 0);

    /* Update profiles.accuracy_avg with running average */
    if (currentProfile) {
      const newAccuracy = currentProfile.accuracy_avg !== null
        ? Math.round((currentProfile.accuracy_avg * 0.7 + accuracy * 0.3))
        : accuracy;
      await sb.from('profiles').update({ accuracy_avg: newAccuracy }).eq('id', currentUser.id);
      currentProfile.accuracy_avg = newAccuracy;
    }

    trackAction('drill_completed', { score: correct, total, accuracy });
    await flushOfflineQueue();
  }

  /* Show results */
  document.getElementById('exam-screen').style.display = 'none';
  const rs = document.getElementById('results-screen');
  rs.style.display = 'flex';

  const jambPred = predictJAMB(accuracy, avgTime);
  const mins = Math.floor(timeUsed / 60);
  const secs = timeUsed % 60;

  document.getElementById('results-grid').innerHTML = `
    <div class="result-stat"><div class="result-stat-label">Score</div><div class="result-stat-val">${correct}/${total}</div></div>
    <div class="result-stat"><div class="result-stat-label">Accuracy</div><div class="result-stat-val">${accuracy}%</div></div>
    <div class="result-stat"><div class="result-stat-label">Time Used</div><div class="result-stat-val">${pad(mins)}:${pad(secs)}</div></div>
    <div class="result-stat accent"><div class="result-stat-label">Pred. JAMB</div><div class="result-stat-val">${jambPred}</div></div>`;
}

/* ── RETRY ── */
function retryExam() {
  cbtSession.answers      = {};
  cbtSession.flags        = new Set();
  cbtSession.currentIndex = 0;
  cbtSession.timeLeft     = cbtSession.mode === 'mock' ? 7200 : 600;
  cbtSession.qTimers      = {};
  document.getElementById('results-screen').style.display = 'none';
  const rs2 = document.getElementById('flagged-review-section');
  if (rs2) rs2.style.display = 'none';
  document.getElementById('exam-screen').style.display = 'flex';
  renderQuestion();
  renderMap();
  startTimer();
  startQTimer();
}

/* ── SAMPLE QUESTION GENERATOR ── */
/* In production this would query a Supabase questions table */
function generateSampleQuestions(subject, count) {
  const bank = {
    Mathematics: [
      { text: 'If x² − 5x + 6 = 0, what are the values of x?', opts: ['x = 2 or x = 3','x = −2 or x = −3','x = 1 or x = 6','x = −1 or x = −6'], ans: 0, topicId: 'quadratics' },
      { text: 'Simplify (2x²)³', opts: ['6x⁵','8x⁵','6x⁶','8x⁶'], ans: 3, topicId: 'indices' },
      { text: 'Find the derivative of y = 3x² + 2x − 5', opts: ['6x + 2','6x − 5','3x + 2','6x'], ans: 0, topicId: 'calculus' },
      { text: 'What is the probability of rolling a sum of 7 with two dice?', opts: ['1/6','1/12','1/36','7/36'], ans: 0, topicId: 'probability' },
      { text: 'If log₁₀ 2 = 0.3010, find log₁₀ 8.', opts: ['0.9030','0.6020','0.4510','1.2040'], ans: 0, topicId: 'logarithms' },
    ],
    'English Language': [
      { text: 'Choose the word nearest in meaning to "EBULLIENT":', opts: ['Enthusiastic','Depressed','Confused','Angry'], ans: 0, topicId: 'vocabulary' },
      { text: 'Identify the figure of speech: "The wind howled through the trees."', opts: ['Personification','Simile','Metaphor','Hyperbole'], ans: 0, topicId: 'figures-of-speech' },
      { text: 'Which sentence is grammatically correct?', opts: ['He don\'t know','He doesn\'t knows','He doesn\'t know','He do not knows'], ans: 2, topicId: 'comprehension' },
    ],
    Physics: [
      { text: 'What is the SI unit of electric charge?', opts: ['Ampere','Coulomb','Volt','Farad'], ans: 1, topicId: 'electricity' },
      { text: 'A body of mass 2 kg moves at 3 m/s. Find its kinetic energy.', opts: ['9 J','6 J','12 J','3 J'], ans: 0, topicId: 'mechanics' },
    ],
    Chemistry: [
      { text: 'What is the atomic number of Carbon?', opts: ['6','12','8','14'], ans: 0, topicId: 'periodic-table' },
      { text: 'Which of the following is an alkane?', opts: ['Ethene','Ethyne','Ethane','Benzene'], ans: 2, topicId: 'organic-chem' },
    ],
  };

  const pool = bank[subject] || bank['Mathematics'];
  const questions = [];
  for (let i = 0; i < count; i++) {
    questions.push({ ...pool[i % pool.length] });
  }
  return questions;
}
