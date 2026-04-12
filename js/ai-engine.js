// ... existing functions from Batch 1 ...

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
    // Sum weighted actions
    const score = usageLogs.reduce((total, log) => total + (weights[log.action] || 0), 0);
    return Math.round(score);
};

window.resolveGradeUrl = async function(topicId, grade) {
    // If Grade 1 or 2 is requested, check if folder exists, else fallback to standard
    const gradePath = `/lessons/${topicId}/grade${grade}/index.html`;
    const standardPath = `/lessons/${topicId}/index.html`;
    
    try {
        const response = await fetch(gradePath, { method: 'HEAD' });
        return response.ok ? gradePath : standardPath;
    } catch (e) {
        return standardPath;
    }
};