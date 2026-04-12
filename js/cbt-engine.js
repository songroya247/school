/**
 * UltimateEdge CBT Engine (v3.1)
 * Handles "Mavis Beacon" logic, adaptive scaling, and offline sync.
 */

let currentSession = {
    mode: 'drill', // 'drill' or 'mock'
    topicId: null,
    questions: [],
    index: 0,
    answers: [], // { id, is_correct, time_spent }
    timer: null,
    startTime: null,
    masteryAtStart: 0
};

// ── 1. SESSION INITIALIZATION ──
async function initCBTSession(topicId, mode = 'drill') {
    currentSession.topicId = topicId;
    currentSession.mode = mode;
    currentSession.index = 0;
    currentSession.answers = [];

    // Fetch question bank
    const resp = await fetch('/data/questions.json');
    const bank = await resp.json();

    // Determine Mode: Drill vs Exam
    const { data: masteryRow } = await sb.from('topic_mastery')
        .select('mastery_level')
        .eq('user_id', currentUser.id)
        .eq('topic_id', topicId)
        .single();
    
    currentSession.masteryAtStart = masteryRow?.mastery_level || 0;
    const isExam = !window.isDrillMode(currentSession.masteryAtStart);

    // 3.3 Mavis Beacon Source Mix
    if (mode === 'drill') {
        const { data: failedLogs } = await sb.from('response_logs')
            .select('topic_id, is_correct')
            .eq('user_id', currentUser.id)
            .eq('topic_id', topicId)
            .eq('is_correct', false);

        const failedIds = [...new Set(failedLogs?.map(l => l.topic_id) || [])];
        const failedBatch = bank.filter(q => failedIds.includes(q.id)).slice(0, 5);
        const remainingBatch = bank.filter(q => q.topic_id === topicId && !failedIds.includes(q.id))
                                   .sort(() => 0.5 - Math.random())
                                   .slice(0, 10 - failedBatch.length);
        
        currentSession.questions = [...failedBatch, ...remainingBatch];
    } else {
        // Mock Mode: 40 Random questions across all subjects
        currentSession.questions = bank.sort(() => 0.5 - Math.random()).slice(0, 40);
    }

    renderQuestion();
}

// ── 2. RENDER LOGIC ──
function renderQuestion() {
    const q = currentSession.questions[currentSession.index];
    if (!q) return finishSession();

    document.getElementById('q-text').textContent = q.text;
    document.getElementById('q-count').textContent = `${currentSession.index + 1}/${currentSession.questions.length}`;
    
    const optsCont = document.getElementById('q-options');
    optsCont.innerHTML = '';
    
    const labels = ['A', 'B', 'C', 'D'];
    q.options.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = 'drill-option';
        btn.innerHTML = `<span class="drill-option__label">${labels[i]}</span> <span>${opt}</span>`;
        btn.onclick = () => handleAnswer(i);
        optsCont.appendChild(btn);
    });

    // Start Timer if in Exam Mode
    startQTimer();
    currentSession.startTime = Date.now();
    updateQuestionMap();
}

// ── 3. ANSWER HANDLING ──
async function handleAnswer(choiceIdx) {
    clearInterval(currentSession.timer);
    const q = currentSession.questions[currentSession.index];
    const timeSpent = Math.round((Date.now() - currentSession.startTime) / 1000);
    const isCorrect = (choiceIdx === q.answer);

    const logEntry = {
        user_id: currentUser.id,
        topic_id: q.topic_id,
        is_correct: isCorrect,
        time_spent: timeSpent,
        grade_at_time: currentProfile.current_skill_level
    };

    currentSession.answers.push(logEntry);
    
    // Offline Persistence (Section 5.3)
    if (!navigator.onLine) {
        const queue = JSON.parse(localStorage.getItem('queued_logs') || '[]');
        queue.push(logEntry);
        localStorage.setItem('queued_logs', JSON.stringify(queue));
    } else {
        await sb.from('response_logs').insert([logEntry]);
    }

    // Award XP
    if (isCorrect) window.addXP(10, 'Correct Answer');

    // Visual Feedback
    const btns = document.querySelectorAll('.drill-option');
    btns.forEach((b, i) => {
        b.disabled = true;
        if (i === q.answer) b.classList.add('correct');
        else if (i === choiceIdx) b.classList.add('wrong');
    });

    setTimeout(() => {
        currentSession.index++;
        renderQuestion();
    }, 1200);
}

// ── 4. PREDICTION & MASTERY UPDATES ──
async function finishSession() {
    const total = currentSession.answers.length;
    const correct = currentSession.answers.filter(a => a.is_correct).length;
    const accuracy = (correct / total) * 100;
    const avgSpeed = currentSession.answers.reduce((s, a) => s + a.time_spent, 0) / total;

    // Save Session Summary
    await sb.from('session_scores').insert([{
        user_id: currentUser.id,
        topic_id: currentSession.topicId,
        exam_type: 'JAMB', // Default
        score: correct,
        total_questions: total,
        accuracy: accuracy,
        avg_time_per_q: avgSpeed,
        grade_level: currentProfile.current_skill_level
    }]);

    // Update Topic Mastery
    const newMastery = window.calcMastery(accuracy, total);
    await sb.from('topic_mastery').upsert({
        user_id: currentUser.id,
        topic_id: currentSession.topicId,
        accuracy_avg: accuracy,
        mastery_level: newMastery,
        last_studied: new Date().toISOString()
    }, { onConflict: 'user_id,topic_id' });

    // Adaptive Scaling
    await window.applyAdaptivePyramid(currentSession.topicId, accuracy);

    showResults(correct, total, accuracy, avgSpeed);
}

// ── 5. UTILITIES ──
function startQTimer() {
    clearInterval(currentSession.timer);
    if (window.isDrillMode(currentSession.masteryAtStart)) {
        document.getElementById('q-timer').style.display = 'none';
        return;
    }
    
    let timeLeft = 45;
    document.getElementById('q-timer').style.display = 'block';
    currentSession.timer = setInterval(() => {
        timeLeft--;
        document.getElementById('q-timer').textContent = `00:${timeLeft < 10 ? '0' : ''}${timeLeft}`;
        if (timeLeft <= 0) {
            clearInterval(currentSession.timer);
            handleAnswer(-1); // Timeout
        }
    }, 1000);
}

function updateQuestionMap() {
    const map = document.getElementById('q-map');
    map.innerHTML = '';
    currentSession.questions.forEach((_, i) => {
        const dot = document.createElement('div');
        dot.className = `q-map__dot ${i === currentSession.index ? 'current' : ''}`;
        if (currentSession.answers[i]) {
            dot.classList.add(currentSession.answers[i].is_correct ? 'correct' : 'wrong');
        }
        dot.textContent = i + 1;
        map.appendChild(dot);
    });
}

window.addEventListener('online', async () => {
    const queue = JSON.parse(localStorage.getItem('queued_logs') || '[]');
    if (queue.length > 0) {
        await sb.from('response_logs').insert(queue);
        localStorage.removeItem('queued_logs');
        toast("Offline progress synced!");
    }
});