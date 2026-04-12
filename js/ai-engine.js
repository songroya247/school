// ============================================================
// ai-engine.js — UltimateEdge School
// Patched: Batch 1 (fixes bugs #7–10)
// ============================================================

// ── UNIFIED MASTERY SCORE (README §3.1) ──
// M = (accuracy% × 0.7) + (min(attempted/50, 1) × 0.3)
window.calcMastery = function(accuracy, totalQuestions) {
    const accDec   = (accuracy || 0) / 100;
    const volRatio = Math.min((totalQuestions || 0) / 50, 1);
    return parseFloat(((accDec * 0.70) + (volRatio * 0.30)).toFixed(3));
};

// ── JAMB PREDICTION — basic (README §3.4) ──
window.predictJAMB = function(acc) {
    if (acc === null || acc === undefined) return "—";
    const raw = Math.round(acc * 4);
    return `${Math.max(0, raw - 15)}–${Math.min(400, raw + 15)}`;
};

// ── JAMB PREDICTION — with speed factor (README §3.4) ──
window.predictJAMBWithSpeed = function(acc, avgSpeed) {
    if (acc === null || acc === undefined) return "—";
    let raw = acc * 4;
    if (avgSpeed < 45)      raw *= 1.05;
    else if (avgSpeed > 65) raw *= 0.90;
    const final = Math.round(raw);
    return `${Math.max(0, final - 15)}–${Math.min(400, final + 15)}`;
};

// ── WAEC/NECO GRADE PREDICTION (FIX #7: B2 restored) ──
// README spec: ≥75→A1, 70–74→B2, 65–69→B3, 50–64→C4–C6, <50→F9
window.predictWAEC = function(acc) {
    if (acc === null || acc === undefined) return "—";
    if (acc >= 75) return "A1";
    if (acc >= 70) return "B2";   // ← was missing
    if (acc >= 65) return "B3";
    if (acc >= 60) return "C4";
    if (acc >= 55) return "C5";
    if (acc >= 50) return "C6";
    return "F9";
};

// ── ADAPTIVE PYRAMID (FIX #8: updates topic_mastery not just profiles) ──
// Updates grade_level on the specific topic row AND profiles.current_skill_level
window.applyAdaptivePyramid = async function(topicId, acc, last20Attempts) {
    // FIX #9: guard against missing globals
    if (!window.sb || !window.currentUser) {
        console.warn('applyAdaptivePyramid: auth not ready');
        return null;
    }

    const newGrade = acc >= 60 ? 3 : (acc >= 40 ? 2 : 1);

    // Update the topic-specific grade (FIX #8)
    await window.sb.from('topic_mastery')
        .update({ grade_level: newGrade })
        .eq('user_id', window.currentUser.id)
        .eq('topic_id', topicId);

    // Also update profile-level skill
    await window.sb.from('profiles')
        .update({ current_skill_level: newGrade })
        .eq('id', window.currentUser.id);

    // Elementary redirect logic (README §3.2)
    if (newGrade === 1) {
        const { data: row } = await window.sb
            .from('topic_mastery')
            .select('attempts_at_grade1')
            .eq('user_id', window.currentUser.id)
            .eq('topic_id', topicId)
            .single();

        const attempts = (row?.attempts_at_grade1 || 0) + 1;
        await window.sb.from('topic_mastery')
            .update({ attempts_at_grade1: attempts })
            .eq('user_id', window.currentUser.id)
            .eq('topic_id', topicId);

        if (attempts > 3 && acc < 40) {
            showElementaryCard(topicId);
        }
    }

    return newGrade;
};

// ── ELEMENTARY REDIRECT CARD ──
function showElementaryCard(topicId) {
    const existing = document.getElementById('elementary-card');
    if (existing) return;
    const card = document.createElement('div');
    card.id = 'elementary-card';
    card.className = 'elementary-card';
    card.innerHTML = `
        <strong>Need more foundation?</strong>
        <p>We recommend starting with the elementary version of this topic.</p>
        <a href="https://elementary.ultimateedge.info/${topicId}"
           class="btn btn-primary" target="_blank">Go to Elementary →</a>
        <button onclick="this.parentElement.remove()" class="btn btn-outline">Stay Here</button>
    `;
    document.body.appendChild(card);
}

// ── MASTERY STATUS LABEL (FIX #10: full range) ──
window.getMasteryLabel = function(masteryScore) {
    if (masteryScore === null || masteryScore === undefined) {
        return { label: 'NIL', cls: 'status-nil' };
    }
    if (masteryScore >= 0.75) return { label: 'MASTERED',     cls: 'status-good' };
    if (masteryScore >= 0.50) return { label: 'LEARNING',     cls: 'status-warn' };
    if (masteryScore >= 0.25) return { label: 'STRUGGLING',   cls: 'status-danger' };
    return                           { label: 'FOUNDATIONAL', cls: 'status-nil' };
};

// ── FULL MASTERY UPDATE (called after every drill/quiz) ──
window.updateTopicMastery = async function(topicId, accuracy, totalAttempts) {
    if (!window.sb || !window.currentUser) return;

    const mastery = window.calcMastery(accuracy, totalAttempts);

    await window.sb.from('topic_mastery')
        .upsert({
            user_id:      window.currentUser.id,
            topic_id:     topicId,
            accuracy_avg: accuracy,
            mastery_level: mastery,
            last_studied: new Date().toISOString()
        }, { onConflict: 'user_id,topic_id' });

    await window.applyAdaptivePyramid(topicId, accuracy);
    return mastery;
};
