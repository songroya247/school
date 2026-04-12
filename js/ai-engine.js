/**
 * UltimateEdge School AI Engine (v3.1)
 * Handles Mastery, Adaptive Pyramid, and Score Predictions.
 */

window.predictJAMB = function(accuracy) {
    if (accuracy === null || accuracy === undefined) return "—";
    const raw = Math.round(accuracy * 4);
    const low = Math.max(0, raw - 15);
    const high = Math.min(400, raw + 15);
    return `${low}–${high}`;
};

window.predictJAMBWithSpeed = function(accuracy, avgSpeed) {
    if (accuracy === null) return "—";
    let raw = accuracy * 4;
    // Section 3.4 Speed Factor
    if (avgSpeed < 45) raw *= 1.05;
    else if (avgSpeed > 65) raw *= 0.90;
    
    const final = Math.round(Math.min(400, raw));
    return `${final - 15}–${final + 15}`;
};

window.predictWAEC = function(accuracy) {
    if (accuracy === null) return "—";
    if (accuracy >= 75) return "A1";
    if (accuracy >= 70) return "B2";
    if (accuracy >= 65) return "B3";
    if (accuracy >= 60) return "C4";
    if (accuracy >= 55) return "C5";
    if (accuracy >= 50) return "C6";
    if (accuracy >= 45) return "D7";
    if (accuracy >= 40) return "E8";
    return "F9";
};

window.predictNECO = function(accuracy) {
    return window.predictWAEC(accuracy); // Uses same scale per spec
};

window.calcMastery = function(accuracy, totalQuestions) {
    // Formula: (Acc Decimal * 0.70) + (Min(Vol/50, 1) * 0.30)
    const accDec = (accuracy || 0) / 100;
    const volRatio = Math.min(totalQuestions / 50, 1);
    return (accDec * 0.70) + (volRatio * 0.30);
};

window.isDrillMode = function(mastery) {
    // Section 14: Mastery < 0.50 triggers Drill Mode (hidden timer)
    return (mastery === null || mastery < 0.50);
};

window.applyAdaptivePyramid = async function(topicId, accuracy, attemptsAtG1 = 0) {
    let newGrade = 3;
    if (accuracy >= 60) newGrade = 3;
    else if (accuracy >= 40) newGrade = 2;
    else newGrade = 1;

    // Update DB
    if (window.sb && window.currentUser) {
        await sb.from('profiles').update({ current_skill_level: newGrade }).eq('id', currentUser.id);
        await sb.from('topic_mastery').update({ 
            grade_level: newGrade,
            attempts_at_grade1: newGrade === 1 ? attemptsAtG1 + 1 : attemptsAtG1
        }).eq('user_id', currentUser.id).eq('topic_id', topicId);
    }
    return newGrade;
};

window.calcCommitmentScore = function(usageLogs) {
    if (!usageLogs || !Array.isArray(usageLogs)) return 0;
    const weights = {
        'page_view': 0.5,
        'video_started': 1,
        'video_completed': 3,
        'drill_attempted': 2,
        'drill_completed': 3,
        'login_streak': 2
    };
    return usageLogs.reduce((total, log) => total + (weights[log.action] || 0), 0);
};

window.getMasteryLabel = function(m) {
    if (m === null) return { label: 'NIL', cls: 'status-nil' };
    if (m >= 0.75) return { label: 'MASTERED', cls: 'status-good' };
    if (m >= 0.50) return { label: 'IN PROGRESS', cls: 'status-active' };
    return { label: 'LEARNING', cls: 'status-warn' };
};

window.getSmartPath = function(topicMastery, limit = 5) {
    // Topics where mastery < 0.75, sorted by lowest score first
    return topicMastery
        .filter(t => t.mastery_level === null || t.mastery_level < 0.75)
        .sort((a, b) => (a.mastery_level || 0) - (b.mastery_level || 0))
        .slice(0, limit);
};

window.resolveGradeUrl = async function(topicId, grade) {
    const gradeUrl = `/lessons/${topicId}/grade${grade}/index.html`;
    const baseUrl  = `/lessons/${topicId}/index.html`;
    try {
        const resp = await fetch(gradeUrl, { method: 'HEAD' });
        return resp.ok ? gradeUrl : baseUrl;
    } catch (e) {
        return baseUrl;
    }
};