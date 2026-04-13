/**
 * CBT ENGINE - UltimateEdge School v4.1
 */

let sessionState = {
    mode: 'mock',
    subject: '',
    topic: '',
    questions: [],
    currentIndex: 0,
    answers: {}, // index: optionIndex
    flags: {},   // index: boolean
    timer: null,
    timeLeft: 7200, // 2 hours in seconds
    isCbtOnly: false,
    startTime: null
};

document.addEventListener('DOMContentLoaded', async () => {
    // Wait for Auth
    await waitForAuth();
    if (!currentUser) return;

    initModeSelector();
    initOfflineSync();
    
    // Load study mode preference (§26)
    sessionState.isCbtOnly = getStudyMode() === 'cbt_only';
    document.getElementById('study-mode-toggle').checked = sessionState.isCbtOnly;
    
    document.getElementById('study-mode-toggle').onchange = (e) => {
        setStudyMode(e.target.checked ? 'cbt_only' : 'drill');
        sessionState.isCbtOnly = e.target.checked;
    };
});

// --- UI & NAVIGATION ---

function initModeSelector() {
    const modeBtns = document.querySelectorAll('.mode-btn');
    modeBtns.forEach(btn => {
        btn.onclick = () => {
            modeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            sessionState.mode = btn.dataset.mode;
            
            // Toggle visibility of topic selection based on mode
            document.getElementById('topic-group').style.display = 
                sessionState.mode === 'practice' ? 'block' : 'none';
        };
    });

    // Populate Subjects from curriculum.json (Mock data here)
    const subjects = ['Mathematics', 'English Language', 'Physics', 'Chemistry'];
    const select = document.getElementById('subject-select');
    subjects.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.toLowerCase();
        opt.textContent = s;
        select.appendChild(opt);
    });
}

async function startSession() {
    sessionState.subject = document.getElementById('subject-select').value;
    sessionState.topic = document.getElementById('topic-select').value;
    
    // Fetch Questions (Stub for real Supabase query)
    // const { data } = await sb.from('questions').select('*')...
    sessionState.questions = await mockFetchQuestions(sessionState.mode);
    
    document.getElementById('setup-view').style.display = 'none';
    document.getElementById('exam-view').style.display = 'block';
    
    sessionState.startTime = Date.now();
    renderQuestion();
    renderMap();
    startTimer();
}

function renderQuestion() {
    const q = sessionState.questions[sessionState.currentIndex];
    document.getElementById('question-meta').textContent = `QUESTION ${sessionState.currentIndex + 1} OF ${sessionState.questions.length}`;
    document.getElementById('question-text').textContent = q.text;
    
    const container = document.getElementById('options-container');
    container.innerHTML = '';
    
    ['A', 'B', 'C', 'D'].forEach((ltr, i) => {
        const btn = document.createElement('button');
        btn.className = `drill-option ${sessionState.answers[sessionState.currentIndex] === i ? 'selected' : ''}`;
        btn.innerHTML = `<span class="opt-ltr">${ltr}</span> ${q.options[i]}`;
        btn.onclick = () => selectOption(i);
        container.appendChild(btn);
    });

    // Update Flag Button UI
    const flagBtn = document.getElementById('btn-flag');
    if (sessionState.flags[sessionState.currentIndex]) {
        flagBtn.classList.add('flagged');
    } else {
        flagBtn.classList.remove('flagged');
    }
}

function selectOption(optionIndex) {
    sessionState.answers[sessionState.currentIndex] = optionIndex;
    renderQuestion();
    renderMap();
    
    // Prediction logic (§15)
    updateJambPrediction();
}

function toggleFlag() {
    const idx = sessionState.currentIndex;
    sessionState.flags[idx] = !sessionState.flags[idx];
    renderQuestion();
    renderMap();
}

function renderMap() {
    const container = document.getElementById('question-map');
    container.innerHTML = '';
    sessionState.questions.forEach((_, i) => {
        const dot = document.createElement('div');
        dot.className = `q-dot ${i === sessionState.currentIndex ? 'current' : ''} 
                        ${sessionState.answers[i] !== undefined ? 'answered' : ''} 
                        ${sessionState.flags[i] ? 'flagged' : ''}`;
        dot.innerHTML = sessionState.flags[i] ? '⚑' : i + 1;
        dot.onclick = () => goToQuestion(i);
        container.appendChild(dot);
    });
}

function goToQuestion(index) {
    sessionState.currentIndex = index;
    renderQuestion();
    renderMap();
}

function nextQuestion() {
    if (sessionState.currentIndex < sessionState.questions.length - 1) {
        goToQuestion(sessionState.currentIndex + 1);
    }
}

function prevQuestion() {
    if (sessionState.currentIndex > 0) {
        goToQuestion(sessionState.currentIndex - 1);
    }
}

// --- TIMER LOGIC (§26) ---

function startTimer() {
    // Hide timer in Drill Mode unless CBT-Only is active or Mastery is high (simplified)
    const shouldShowTimer = sessionState.mode === 'mock' || sessionState.isCbtOnly;
    document.getElementById('timer-display').style.visibility = shouldShowTimer ? 'visible' : 'hidden';

    sessionState.timer = setInterval(() => {
        sessionState.timeLeft--;
        if (sessionState.timeLeft <= 0) {
            clearInterval(sessionState.timer);
            finishSession();
        }
        updateTimerUI();
    }, 1000);
}

function updateTimerUI() {
    const h = Math.floor(sessionState.timeLeft / 3600).toString().padStart(2, '0');
    const m = Math.floor((sessionState.timeLeft % 3600) / 60).toString().padStart(2, '0');
    const s = (sessionState.timeLeft % 60).toString().padStart(2, '0');
    document.getElementById('timer-display').textContent = `${h}:${m}:${s}`;
}

// --- DATA RECORDING & SYNC (§13) ---

async function recordResponse(qIndex, isCorrect) {
    const q = sessionState.questions[qIndex];
    const log = {
        user_id: currentUser.id,
        topic_id: q.topic_id,
        is_correct: isCorrect,
        time_spent: 15, // Calculation: (Date.now() - lastAction) / 1000
        grade_level: currentProfile.current_skill_level || 3,
        exam_type: sessionState.mode.toUpperCase()
    };

    if (navigator.onLine) {
        await sb.from('response_logs').insert([log]);
        updateTopicMastery(q.topic_id, isCorrect);
        if (isCorrect) addXP(10, 'Correct Answer');
    } else {
        saveToIndexedDB(log);
    }
}

function saveToIndexedDB(log) {
    let queue = JSON.parse(localStorage.getItem('ue_offline_queue') || '[]');
    queue.push(log);
    localStorage.setItem('ue_offline_queue', JSON.stringify(queue));
    toast("Answer saved offline 📴");
}

function initOfflineSync() {
    window.addEventListener('online', async () => {
        let queue = JSON.parse(localStorage.getItem('ue_offline_queue') || '[]');
        if (queue.length > 0) {
            const { error } = await sb.from('response_logs').insert(queue);
            if (!error) {
                localStorage.removeItem('ue_offline_queue');
                toast("Synced offline data 🚀");
            }
        }
    });
}

// --- SESSION END & RESULTS (§25, §23) ---

function finishSession() {
    clearInterval(sessionState.timer);
    
    // Check for flags (§25)
    const flaggedIndices = Object.keys(sessionState.flags).filter(k => sessionState.flags[k]);
    if (flaggedIndices.length > 0) {
        showReviewScreen(flaggedIndices);
    } else {
        showResults();
    }
}

function showReviewScreen(indices) {
    document.getElementById('exam-view').style.display = 'none';
    document.getElementById('review-view').style.display = 'block';
    
    const container = document.getElementById('flagged-list');
    container.innerHTML = '';
    indices.forEach(idx => {
        const dot = document.createElement('div');
        dot.className = 'q-dot flagged';
        dot.textContent = parseInt(idx) + 1;
        dot.onclick = () => {
            backToExam();
            goToQuestion(parseInt(idx));
        };
        container.appendChild(dot);
    });
}

function backToExam() {
    document.getElementById('review-view').style.display = 'none';
    document.getElementById('exam-view').style.display = 'block';
    startTimer();
}

async function showResults() {
    document.getElementById('review-view').style.display = 'none';
    document.getElementById('exam-view').style.display = 'none';
    document.getElementById('results-view').style.display = 'block';

    let correct = 0;
    const total = sessionState.questions.length;

    sessionState.questions.forEach((q, i) => {
        const isCorrect = sessionState.answers[i] === q.correctAnswer;
        if (isCorrect) correct++;
        recordResponse(i, isCorrect);
    });

    const accuracy = (correct / total) * 100;
    document.getElementById('result-score-circle').textContent = `${Math.round(accuracy)}%`;
    document.getElementById('result-text').textContent = `You scored ${correct} out of ${total} correctly.`;
    
    // JAMB Prediction Card (§15)
    const jambRange = predictJAMB(accuracy);
    document.getElementById('final-jamb-range').textContent = jambRange;

    // Silent algorithm running (§26)
    if (typeof applyAdaptivePyramid === 'function') {
        // Silently update mastery and pyramid
        // applyAdaptivePyramid(topicId, accuracy, ...);
    }
}

// --- UTILS ---

function updateJambPrediction() {
    let correct = 0;
    let answeredCount = 0;
    Object.keys(sessionState.answers).forEach(idx => {
        answeredCount++;
        if (sessionState.answers[idx] === sessionState.questions[idx].correctAnswer) correct++;
    });
    
    if (answeredCount === 0) return;
    const acc = (correct / answeredCount) * 100;
    document.getElementById('jamb-range').textContent = predictJAMB(acc);
}

async function mockFetchQuestions(mode) {
    const count = mode === 'mock' ? 40 : 10;
    return Array.from({ length: count }, (_, i) => ({
        text: `Sample question text for item #${i + 1}. What is the correct principle being applied here?`,
        options: ["Choice Alpha", "Choice Beta", "Choice Gamma", "Choice Delta"],
        correctAnswer: 1, // Beta
        topic_id: 'sample-topic'
    }));
}