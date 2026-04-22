/* ═══════════════════════════════════════════════════
   UE School — Dashboard Live Data
   Wires all dashboard UI to real Supabase data.
   Handles brand-new users (zero records) gracefully.
═══════════════════════════════════════════════════ */

const DASHBOARD = (function () {

  // ── Subject registry ──────────────────────────────
  const SUBJECT_META = {
    mathematics: { icon: '📐', label: 'Mathematics',     color: '#3b82f6' },
    english:     { icon: '📖', label: 'English Language', color: '#10b981' },
    physics:     { icon: '⚛️', label: 'Physics',          color: '#7c3aed' },
    chemistry:   { icon: '🧪', label: 'Chemistry',        color: '#ff6b35' },
    biology:     { icon: '🌿', label: 'Biology',           color: '#0891b2' },
    economics:   { icon: '📈', label: 'Economics',        color: '#f59e0b' },
    government:  { icon: '🏛️', label: 'Government',       color: '#6366f1' },
    literature:  { icon: '📚', label: 'Literature',        color: '#ec4899' },
    geography:   { icon: '🌍', label: 'Geography',         color: '#10b981' },
    commerce:    { icon: '🏪', label: 'Commerce',          color: '#8b5cf6' },
    accounts:    { icon: '💼', label: 'Accounts',          color: '#14b8a6' },
    crk:         { icon: '✝️', label: 'CRK',               color: '#6d28d9' },
  };

  // Topic lists per subject
  const SUBJECT_TOPICS = {
    mathematics: ['Quadratics','Indices','Logarithms','Probability','Calculus','Sets','Geometry','Statistics'],
    english:     ['Comprehension','Essay Writing','Summary','Oral English','Lexis & Structure'],
    physics:     ['Mechanics','Waves','Electricity','Optics','Thermodynamics','Modern Physics'],
    chemistry:   ['Organic Chemistry','Periodic Table','Acids & Bases','Electrochemistry','Kinetics'],
    biology:     ['Cell Biology','Genetics','Ecology','Nutrition','Evolution'],
    economics:   ['Supply & Demand','National Income','Money & Banking','Trade','Development'],
    government:  ['Constitution','Legislature','Executive','Judiciary','International Relations'],
    literature:  ['Prose','Poetry','Drama','Oral Literature'],
    geography:   ['Physical Geography','Human Geography','Map Reading','Climate'],
    commerce:    ['Trade','Business Finance','Insurance','Transportation'],
    accounts:    ['Bookkeeping','Final Accounts','Costing','Partnership'],
    crk:         ['Old Testament','New Testament','Church History'],
  };

  // ── Progress colour ───────────────────────────────
  function progressColor(pct) {
    if (pct === null || pct === undefined) return 'fill-grey';
    if (pct >= 70) return 'fill-green';
    if (pct >= 40) return 'fill-orange';
    return 'fill-blue';
  }

  // ── Days until exam ───────────────────────────────
  function daysUntil(dateStr) {
    if (!dateStr) return null;
    // examDate stored as "May 2026" — parse to 1st of that month
    const d = new Date(dateStr);
    if (isNaN(d)) return null;
    return Math.ceil((d - Date.now()) / 86400000);
  }

  // ── Streak calculation ────────────────────────────
  function calcStreak(usageLogs) {
    if (!usageLogs || usageLogs.length === 0) return 0;
    const days = new Set(
      usageLogs.map(l => new Date(l.ts).toDateString())
    );
    let streak = 0;
    let d = new Date();
    while (days.has(d.toDateString())) {
      streak++;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  }

  // ── Aggregate mastery by subject ──────────────────
  function groupMasteryBySubject(masteryRows) {
    const map = {};
    for (const row of (masteryRows || [])) {
      // topic_id format: "subject.TopicName" e.g. "mathematics.Quadratics"
      const subjKey = row.topic_id.split('.')[0];
      if (!map[subjKey]) map[subjKey] = [];
      map[subjKey].push(row);
    }
    return map;
  }

  function subjectMasteryPct(rows) {
    const active = rows.filter(r => r.mastery_level !== null && r.mastery_level !== undefined);
    if (active.length === 0) return null;
    return Math.round((active.reduce((s, r) => s + r.mastery_level, 0) / active.length) * 100);
  }

  // ════════════════════════════════════════════════
  //  RENDER FUNCTIONS
  // ════════════════════════════════════════════════

  // ── Welcome Card ──────────────────────────────────
  function renderWelcome(profile, masteryRows) {
    const firstName  = (profile.full_name || 'Student').split(' ')[0];
    const examDays   = daysUntil(profile.exam_date);
    const streak     = calcStreak(profile.usage_logs);

    // Welcome card headline
    const welcomeEl = document.getElementById('dash-welcome-name');
    if (welcomeEl) welcomeEl.textContent = firstName;

    // Subtitle
    const subEl = document.getElementById('dash-welcome-subtitle');
    if (subEl) {
      let text = '';
      if (examDays !== null && examDays > 0) {
        text = `${examDays} day${examDays !== 1 ? 's' : ''} to your exam. `;
      } else if (examDays !== null && examDays <= 0) {
        text = 'Exam time is here! ';
      }
      text += streak > 0
        ? `You're on a ${streak}-day streak — keep it up! 🔥`
        : 'Start a session today to build your streak.';
      subEl.textContent = text;
    }

    // Next recommended topic
    const nextTopicEl = document.getElementById('dash-next-topic');
    if (nextTopicEl) {
      const queue = SMARTPATH.buildQueue(masteryRows, 1);
      if (queue.length > 0) {
        const rec   = queue[0];
        const parts = rec.topic_id.split('.');
        const subj  = parts[0], topic = parts[1] || SMARTPATH.formatTopicLabel(rec.topic_id);
        const meta  = SUBJECT_META[subj] || { label: subj, icon: '📚' };
        nextTopicEl.textContent = `${meta.label}: ${topic}`;
      } else {
        nextTopicEl.textContent = 'Choose a subject below to get started';
      }
    }

    // Nav streak badge
    const streakEl = document.getElementById('nav-streak');
    if (streakEl) {
      streakEl.textContent = streak > 0 ? `🔥 ${streak}-day streak` : '🔥 Start streak';
    }

    // Nav XP
    const xpEl = document.getElementById('nav-xp');
    if (xpEl) xpEl.textContent = `${profile.total_xp ?? 0} XP`;
  }

  // ── Score Prediction Card ─────────────────────────
  function renderScoreCard(profile, masteryRows) {
    const prediction = SMARTPATH.predictJAMBScore(profile, masteryRows);
    const target     = profile.target_score || 250;

    const valueEl = document.getElementById('score-value');
    const hintEl  = document.getElementById('score-hint');
    const fillEl  = document.getElementById('score-progress-fill');

    if (!valueEl) return;

    if (!prediction) {
      // New user — no data yet
      valueEl.innerHTML = `<span style="font-size:1.5rem;color:var(--muted)">No data yet</span>`;
      if (hintEl) hintEl.textContent = 'Complete your first practice session to see your predicted score.';
      if (fillEl) fillEl.style.width = '0%';
    } else {
      valueEl.innerHTML = `${prediction.low}–${prediction.high}<span class="score-denom">/400</span>`;
      const midpoint = Math.round((prediction.low + prediction.high) / 2);
      const gap = target - midpoint;
      if (hintEl) {
        if (gap > 0) {
          hintEl.textContent = `${gap} points away from your target of ${target}. Keep pushing!`;
        } else {
          hintEl.textContent = `You've hit your target of ${target}! Aim higher? 🎉`;
        }
      }
      if (fillEl) fillEl.style.width = prediction.pct + '%';
    }
  }

  // ── Subjects Slider ───────────────────────────────
  function renderSubjectsSlider(profile, masteryBySubject) {
    const track     = document.getElementById('dash-track');
    const subjects  = profile.exam_subjects || [];

    if (!track) return;

    if (subjects.length === 0) {
      track.innerHTML = `
        <div style="padding:32px;color:var(--muted);font-size:.9rem;text-align:center;width:100%">
          No subjects selected yet.
          <a href="login.html?tab=signup" style="color:var(--accent);font-weight:700">Update your profile →</a>
        </div>`;
      return;
    }

    track.innerHTML = subjects.map(subj => {
      const meta   = SUBJECT_META[subj] || { icon: '📚', label: subj, color: '#6b7280' };
      const rows   = masteryBySubject[subj] || [];
      const pct    = subjectMasteryPct(rows);
      const pctStr = pct !== null ? `${pct}%` : 'NIL';
      const fill   = pct !== null ? progressColor(pct) : 'fill-grey';
      const fillW  = pct !== null ? pct : 0;
      const masteryColor = pct !== null ? '' : 'color:var(--muted)';

      return `
        <div class="dash-subj-slide" style="flex:0 0 280px">
          <div class="dash-subj-card">
            <div class="dash-subj-head">
              <div class="dash-subj-icon">${meta.icon}</div>
              <div class="dash-subj-name" style="color:${meta.color}">${meta.label}</div>
            </div>
            <div class="dash-subj-mastery-row">
              <span>Mastery</span>
              <span style="font-family:var(--font-mono);font-weight:700;${masteryColor}">${pctStr}</span>
            </div>
            <div class="subj-progress-track">
              <div class="subj-progress-fill ${fill}" style="width:${fillW}%"></div>
            </div>
            <div class="dash-subj-btns">
              <a href="classroom.html?subject=${subj}" class="btn btn-primary" style="font-size:.78rem">▶ Lesson</a>
              <a href="cbt.html?subject=${subj}" class="btn btn-outline" style="font-size:.78rem">Practice</a>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  // ── Detailed Performance Section ──────────────────
  function renderPerformance(profile, masteryRows) {
    const container = document.getElementById('perf-container');
    if (!container) return;

    const subjects  = profile.exam_subjects || [];

    if (subjects.length === 0 || masteryRows.length === 0) {
      container.innerHTML = `
        <div style="padding:48px 24px;text-align:center;color:var(--muted)">
          <div style="font-size:2rem;margin-bottom:12px">📊</div>
          <div style="font-weight:700;margin-bottom:6px">No performance data yet</div>
          <div style="font-size:.88rem">Complete your first CBT session to see your results here.</div>
          <a href="cbt.html" class="btn btn-primary" style="margin-top:20px;display:inline-flex">Start Practice</a>
        </div>`;
      return;
    }

    const masteryMap = {};
    for (const row of masteryRows) masteryMap[row.topic_id] = row;

    const masteryBySubject = groupMasteryBySubject(masteryRows);

    container.innerHTML = subjects.map((subj, idx) => {
      const meta      = SUBJECT_META[subj] || { icon: '📚', label: subj };
      const rows      = masteryBySubject[subj] || [];
      const subjPct   = subjectMasteryPct(rows);
      const pctStr    = subjPct !== null ? `${subjPct}%` : 'NIL';
      const pctColor  = subjPct !== null ? '' : 'color:var(--muted)';
      const fill      = subjPct !== null ? progressColor(subjPct) : 'fill-grey';
      const fillW     = subjPct !== null ? subjPct : 0;
      const expandId  = `expand-${subj}`;
      const isLast    = idx === subjects.length - 1;

      // Topic rows
      const topics    = SUBJECT_TOPICS[subj] || [];
      const topicHTML = topics.map(topicName => {
        const topicId    = `${subj}.${topicName}`;
        const row        = masteryMap[topicId];
        const topicPct   = row?.mastery_level !== undefined && row?.mastery_level !== null
          ? Math.round(row.mastery_level * 100) : null;
        const topicFill  = topicPct !== null ? progressColor(topicPct) : 'fill-grey';
        const topicFillW = topicPct !== null ? topicPct : 0;
        const status     = row ? SMARTPATH.classifyTopic(row) : 'Not Started';
        const statusColor = status === 'Needs Attention' ? 'color:#f87171' :
                            status === 'On Track'        ? 'color:#34d399' : '';
        return `
          <div class="perf-topic-row">
            <span class="perf-topic-name">${topicName}</span>
            <div class="perf-topic-track">
              <div class="perf-topic-fill ${topicFill}" style="width:${topicFillW}%"></div>
            </div>
            <span class="perf-topic-label" style="${statusColor}">${status}</span>
            <a href="classroom.html?subject=${subj}&topic=${encodeURIComponent(topicName)}" class="btn btn-sm btn-outline">Study</a>
            <a href="cbt.html?subject=${subj}&topic=${encodeURIComponent(topicName)}" class="btn btn-sm btn-primary" style="margin-left:4px">Practice</a>
          </div>`;
      }).join('');

      return `
        <div>
          <div class="perf-bar-row" onclick="toggleExpand('${expandId}',this)"
               ${isLast ? 'style="border-bottom:none"' : ''}>
            <span class="perf-subject-name">${meta.icon} ${meta.label}</span>
            <div class="perf-bar-track">
              <div class="perf-bar-fill ${fill}" style="width:${fillW}%"></div>
            </div>
            <span class="perf-pct" style="${pctColor}">${pctStr}</span>
            <span class="perf-expand-chevron">▾</span>
          </div>
          <div class="perf-subject-detail" id="${expandId}">
            ${topicHTML}
          </div>
        </div>`;
    }).join('');
  }

  // ── SmartPath Recommendations ─────────────────────
  function renderSmartPath(masteryRows) {
    const container = document.getElementById('smartpath-container');
    if (!container) return;

    const queue = SMARTPATH.buildQueue(masteryRows, 3);

    if (queue.length === 0) {
      container.innerHTML = `
        <div style="grid-column:1/-1;padding:40px 24px;text-align:center;
             background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg)">
          <div style="font-size:2rem;margin-bottom:12px">🚀</div>
          <div style="font-weight:700;margin-bottom:6px;font-size:1rem">SmartPath is getting ready</div>
          <div style="font-size:.88rem;color:var(--muted)">
            Complete a few practice sessions and SmartPath™ will start recommending what to study next.
          </div>
          <a href="cbt.html" class="btn btn-primary" style="margin-top:20px;display:inline-flex">Start First Session</a>
        </div>`;
      return;
    }

    container.innerHTML = queue.map(rec => {
      const parts    = rec.topic_id.split('.');
      const subj     = parts[0];
      const topicName = parts.slice(1).join(' ') || SMARTPATH.formatTopicLabel(rec.topic_id);
      const meta     = SUBJECT_META[subj] || { icon: '📚' };
      const desc     = SMARTPATH.buildDescription(rec.classification, rec.topic_id);
      const type     = rec.classification;

      return `
        <div class="smartpath-card">
          <div class="smartpath-tag" data-type="${type}">${type}</div>
          <div class="smartpath-topic">${meta.icon} ${topicName}</div>
          <div class="smartpath-desc">${desc}</div>
          <div class="smartpath-btns">
            <a href="classroom.html?subject=${subj}&topic=${encodeURIComponent(topicName)}"
               class="btn btn-primary btn-sm">Watch Lesson</a>
            <a href="cbt.html?subject=${subj}&topic=${encodeURIComponent(topicName)}"
               class="btn btn-outline btn-sm">Practice</a>
          </div>
        </div>`;
    }).join('');
  }

  // ── Subscription status banner ────────────────────
  function renderSubscriptionStatus(profile) {
    const status   = AUTH_GUARD.subscriptionStatus(profile);
    const banner   = document.getElementById('defaulter-banner');
    const upgradeSection = document.getElementById('upgrade-cta');

    if (banner) {
      banner.style.display = status === 'EXPIRED' ? 'block' : 'none';
    }

    if (upgradeSection) {
      upgradeSection.style.display = status === 'NIL' ? 'block' : 'none';
    }
  }

  // ── Recent sessions ───────────────────────────────
  async function loadRecentSessions(userId) {
    const { data } = await window.sb
      .from('session_scores')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);
    return data || [];
  }

  // ════════════════════════════════════════════════
  //  MAIN INIT — called on DOMContentLoaded
  // ════════════════════════════════════════════════
  async function init() {
    const authResult = await AUTH_GUARD.init();
    if (!authResult) return; // redirecting to login

    const { profile, session } = authResult;
    const userId = session.user.id;

    // Show skeleton loaders while fetching
    showSkeletons();

    // ── Fetch mastery data ──
    const { data: masteryRows } = await window.sb
      .from('topic_mastery')
      .select('*')
      .eq('user_id', userId);

    const rows           = masteryRows || [];
    const masteryBySubj  = groupMasteryBySubject(rows);

    // ── Render all sections ──
    renderWelcome(profile, rows);
    renderScoreCard(profile, rows);
    renderSubjectsSlider(profile, masteryBySubj);
    renderPerformance(profile, rows);
    renderSmartPath(rows);
    renderSubscriptionStatus(profile);

    // ── Re-init slider after subjects are rendered ──
    if (typeof initSlider === 'function') {
      initSlider('dash-track', 'dash-prev', 'dash-next');
    }

    // ── Hide skeletons ──
    hideSkeletons();

    // ── Save updated SmartPath queue to profile ──
    const queue = SMARTPATH.buildQueue(rows, 6);
    if (queue.length > 0 && userId) {
      await SMARTPATH.saveQueue(userId, queue);
    }

    // ── Track dashboard visit ──
    await AUTH.trackAction('dashboard_view');
  }

  function showSkeletons() {
    document.querySelectorAll('[data-skeleton]').forEach(el => {
      el.style.opacity = '.4';
      el.style.pointerEvents = 'none';
    });
  }

  function hideSkeletons() {
    document.querySelectorAll('[data-skeleton]').forEach(el => {
      el.style.opacity = '';
      el.style.pointerEvents = '';
    });
  }

  return { init };

})();
