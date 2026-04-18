/* ═══════════════════════════════════════════════════
   UE School — Grading Engine
   Handles: mastery calculation, topic_mastery upserts,
            session_scores writes, XP awards, grade levels.
═══════════════════════════════════════════════════ */

const GRADING = (function () {

  // ── Grade level thresholds ────────────────────────
  // Grade 3 = easiest (new student), Grade 1 = hardest
  // Student starts at grade 3, moves to 2 at >65% accuracy,
  // moves to 1 at >80% accuracy at grade 2.
  // Falls back if accuracy drops below 40%.

  const GRADE_UP_THRESHOLD   = 0.65; // accuracy to advance grade
  const GRADE_TOP_THRESHOLD  = 0.80; // accuracy to reach grade 1
  const GRADE_DOWN_THRESHOLD = 0.40; // accuracy to fall back
  const MASTERY_WEIGHTS = { accuracy: 0.6, grade: 0.4 };

  // ── XP awards ─────────────────────────────────────
  const XP = {
    correct:     10,
    session:     50,
    perfect:     100, // bonus for 100% session
    streak_day:  20,
  };

  // ── Calculate mastery level (0–1) ─────────────────
  // Combines accuracy average and grade level achieved
  function calcMasteryLevel(accuracyAvg, gradeLevel) {
    // Grade contribution: grade1=1.0, grade2=0.66, grade3=0.33
    const gradeScore = (4 - gradeLevel) / 3;
    return (
      MASTERY_WEIGHTS.accuracy * accuracyAvg +
      MASTERY_WEIGHTS.grade    * gradeScore
    );
  }

  // ── Determine next grade level ─────────────────────
  function nextGradeLevel(currentGrade, sessionAccuracy, attemptsAtGrade1) {
    if (currentGrade === 3 && sessionAccuracy >= GRADE_UP_THRESHOLD) return 2;
    if (currentGrade === 2 && sessionAccuracy >= GRADE_TOP_THRESHOLD) return 1;
    if (currentGrade === 1 && sessionAccuracy < GRADE_DOWN_THRESHOLD) return 2;
    if (currentGrade === 2 && sessionAccuracy < GRADE_DOWN_THRESHOLD) return 3;
    return currentGrade;
  }

  // ── Process a completed session ───────────────────
  // questions: array of question objects
  // answers:   { questionIndex: selectedOptionIndex, ... }
  // timings:   { questionIndex: secondsSpent, ... }
  // meta:      { subject, topic, examType, gradeLevel, userId }
  async function processSession({ questions, answers, timings, meta }) {
    const userId    = meta.userId || window.UE_USER_ID;
    const subject   = meta.subject;
    const topic     = meta.topic;
    const examType  = meta.examType || 'JAMB';
    const gradeLevel = meta.gradeLevel || 3;

    if (!userId || !questions.length) return null;

    // ── Score the session ──
    let correct = 0;
    const results = questions.map((q, i) => {
      const isCorrect = answers[i] === q.ans;
      if (isCorrect) correct++;
      return { question: q, selected: answers[i], isCorrect, timeSpent: timings?.[i] || 0 };
    });

    const total    = questions.length;
    const accuracy = correct / total;
    const avgTime  = results.reduce((s, r) => s + r.timeSpent, 0) / total;

    // ── Write session_scores ──
    const sessionRecord = {
      user_id:        userId,
      exam_type:      examType,
      score:          correct,
      total_questions: total,
      accuracy:       Math.round(accuracy * 100) / 100,
      avg_time_per_q: Math.round(avgTime * 10) / 10,
      grade_level:    gradeLevel
    };
    await window.sb.from('session_scores').insert(sessionRecord);

    // ── Write response_logs (one per question) ──
    const logInserts = results.map(r => ({
      user_id:    userId,
      topic_id:   topic ? `${subject}.${topic}` : subject,
      exam_type:  examType,
      is_correct: r.isCorrect,
      time_spent: r.timeSpent,
      grade_level: gradeLevel
    }));
    await window.sb.from('response_logs').insert(logInserts);

    // ── Update topic_mastery (per topic) ──
    const topicGroups = groupByTopic(results, subject);
    for (const [topicKey, topicResults] of Object.entries(topicGroups)) {
      await upsertTopicMastery(userId, topicKey, topicResults, gradeLevel);
    }

    // ── Update profile accuracy_avg + mastery_level ──
    await updateProfileStats(userId);

    // ── Award XP ──
    const xpEarned = calcXP(correct, total, accuracy);
    await awardXP(userId, xpEarned);

    // ── Determine new grade level ──
    const newGradeLevel = nextGradeLevel(gradeLevel, accuracy, 0);

    return {
      correct, total, accuracy,
      xpEarned, newGradeLevel,
      results,
      sessionRecord
    };
  }

  // ── Group results by topic ────────────────────────
  function groupByTopic(results, subject) {
    const groups = {};
    for (const r of results) {
      const key = `${subject}.${r.question.topic}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    }
    return groups;
  }

  // ── Upsert topic_mastery ──────────────────────────
  async function upsertTopicMastery(userId, topicId, results, gradeLevel) {
    // Fetch existing row
    const { data: existing } = await window.sb
      .from('topic_mastery')
      .select('*')
      .eq('user_id', userId)
      .eq('topic_id', topicId)
      .maybeSingle();

    const sessionAccuracy = results.filter(r => r.isCorrect).length / results.length;

    let newAccuracy, newGrade, newAttempts;

    if (existing) {
      // Running average: blend old accuracy with new session (weighted by n)
      const oldN = 10; // treat old accuracy as representing 10 questions
      const newN  = results.length;
      const blended = ((existing.accuracy_avg || 0) * oldN + sessionAccuracy * newN) / (oldN + newN);
      newAccuracy = Math.round(blended * 1000) / 1000;
      newGrade    = nextGradeLevel(existing.grade_level || 3, sessionAccuracy, existing.attempts_at_grade1 || 0);
      newAttempts = existing.grade_level === 1 ? (existing.attempts_at_grade1 || 0) + 1 : (existing.attempts_at_grade1 || 0);
    } else {
      newAccuracy = Math.round(sessionAccuracy * 1000) / 1000;
      newGrade    = nextGradeLevel(3, sessionAccuracy, 0);
      newAttempts = 0;
    }

    const masteryLevel = calcMasteryLevel(newAccuracy, newGrade);
    const status = masteryLevel >= 0.75 ? 'MASTERED'
                 : masteryLevel  > 0    ? 'IN_PROGRESS'
                 : 'NIL';

    if (existing) {
      await window.sb.from('topic_mastery').update({
        accuracy_avg:      newAccuracy,
        mastery_level:     masteryLevel,
        grade_level:       newGrade,
        attempts_at_grade1: newAttempts,
        status,
        last_studied:      new Date().toISOString()
      }).eq('id', existing.id);
    } else {
      await window.sb.from('topic_mastery').insert({
        user_id:           userId,
        topic_id:          topicId,
        accuracy_avg:      newAccuracy,
        mastery_level:     masteryLevel,
        grade_level:       newGrade,
        attempts_at_grade1: newAttempts,
        status,
        last_studied:      new Date().toISOString()
      });
    }
  }

  // ── Update profile aggregate stats ───────────────
  async function updateProfileStats(userId) {
    const { data: masteryRows } = await window.sb
      .from('topic_mastery')
      .select('mastery_level, accuracy_avg')
      .eq('user_id', userId)
      .not('mastery_level', 'is', null);

    if (!masteryRows || masteryRows.length === 0) return;

    const avgAcc     = masteryRows.reduce((s, r) => s + (r.accuracy_avg || 0), 0) / masteryRows.length;
    const avgMastery = masteryRows.reduce((s, r) => s + (r.mastery_level || 0), 0) / masteryRows.length;

    await window.sb.from('profiles').update({
      accuracy_avg:  Math.round(avgAcc * 1000) / 1000,
      mastery_level: Math.round(avgMastery * 1000) / 1000,
      status:        'ACTIVE'
    }).eq('id', userId);
  }

  // ── XP calculation ────────────────────────────────
  function calcXP(correct, total, accuracy) {
    let xp = correct * XP.correct + XP.session;
    if (accuracy === 1) xp += XP.perfect;
    return xp;
  }

  async function awardXP(userId, amount) {
    // Increment total_xp using a read-then-write (RLS safe approach)
    const { data: profile } = await window.sb
      .from('profiles').select('total_xp').eq('id', userId).single();
    const current = profile?.total_xp || 0;
    await window.sb.from('profiles')
      .update({ total_xp: current + amount }).eq('id', userId);
  }

  // ── Grade label ───────────────────────────────────
  function gradeLabel(level) {
    return level === 1 ? 'Advanced' : level === 2 ? 'Intermediate' : 'Foundation';
  }

  return {
    processSession,
    calcMasteryLevel,
    nextGradeLevel,
    calcXP,
    awardXP,
    gradeLabel,
    GRADE_UP_THRESHOLD,
    GRADE_DOWN_THRESHOLD
  };

})();
