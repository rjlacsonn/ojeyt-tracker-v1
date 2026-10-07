/* ============================================================
   UI — OJeyT Tracker
   All DOM rendering helpers
   ============================================================ */

const UI = (() => {

  /* ---- TOAST ---- */
  let toastTimeout = null;
  function toast(msg, duration = 2200) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.remove('show'), duration);
  }

  /* ---- NAVIGATION ---- */
  function setPage(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const pageEl = document.getElementById('page-' + page);
    const navEl  = document.getElementById('nav-' + page);
    if (pageEl) pageEl.classList.add('active');
    if (navEl)  navEl.classList.add('active');
  }

  /* ---- GREETING ---- */
  function updateGreeting() {
    const hour = new Date().getHours();
    let msg = 'Good morning';
    if (hour >= 12 && hour < 17) msg = 'Good afternoon';
    else if (hour >= 17) msg = 'Good evening';
    document.getElementById('greeting-msg').textContent = msg + '!';
    document.getElementById('today-date').textContent =
      new Date().toLocaleDateString('en-PH', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
      });
  }

  /* ---- HERO CARD ---- */
  function setHeroActive(isActive, startedAt) {
    const btn       = document.getElementById('main-btn');
    const btnIcon   = document.getElementById('btn-icon');
    const btnLabel  = document.getElementById('btn-label');
    const liveBadge = document.getElementById('live-badge');
    const idleBadge = document.getElementById('idle-badge');
    const hint      = document.getElementById('hero-hint');
    const started   = document.getElementById('hero-started');

    if (isActive) {
      btn.className = 'checkin-btn check-out';
      btnIcon.textContent = '✕';
      btnLabel.textContent = 'Check Out';
      liveBadge.style.display = 'flex';
      idleBadge.style.display = 'none';
      hint.textContent = 'Session in progress — tap to end';
      if (startedAt) {
        const t = new Date(startedAt).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
        started.textContent = 'Started at ' + t;
        started.style.display = 'block';
      }
    } else {
      btn.className = 'checkin-btn check-in';
      btnIcon.textContent = '✓';
      btnLabel.textContent = 'Check In';
      liveBadge.style.display = 'none';
      idleBadge.style.display = 'block';
      hint.textContent = 'Tap to start your OJT session';
      started.style.display = 'none';
      document.getElementById('timer-display').textContent = '00:00:00';
    }
  }

  /* ---- PROGRESS ---- */
  function updateProgress(totalSecs, requiredHours) {
    const req = requiredHours * 3600;
    const pct = req > 0 ? Math.min(100, (totalSecs / req) * 100) : 0;
    const totH = (totalSecs / 3600).toFixed(1);
    const remH = Math.max(0, requiredHours - totalSecs / 3600).toFixed(1);

    document.getElementById('prog-fill').style.width = pct.toFixed(1) + '%';
    const barEl = document.getElementById('progress-bar-el');
    if (barEl) barEl.setAttribute('aria-valuenow', pct.toFixed(0));
    document.getElementById('prog-nums').textContent = totH + 'h / ' + requiredHours + 'h';
    document.getElementById('progress-pct-badge').textContent = pct.toFixed(0) + '%';
    document.getElementById('prog-remaining').textContent =
      req <= 0
        ? 'Configure your required hours in Settings →'
        : pct >= 100
          ? '🎉 You\'ve completed your OJT hours!'
          : remH + 'h remaining · ' + pct.toFixed(0) + '% complete';
  }

  /* ---- STATS ---- */
  function updateStats(totalSecs, weekSecs, sessionCount, avgSecs) {
    document.getElementById('stat-total').textContent    = (totalSecs / 3600).toFixed(1) + 'h';
    document.getElementById('stat-week').textContent     = (weekSecs / 3600).toFixed(1) + 'h';
    document.getElementById('stat-sessions').textContent = sessionCount;
    document.getElementById('stat-avg').textContent      = sessionCount > 0
      ? (avgSecs / 3600).toFixed(1) + 'h' : '0.0h';
  }

  /* ---- STREAK ---- */
  function updateStreak(streak) {
    document.getElementById('streak-display').textContent = streak + ' day' + (streak !== 1 ? 's' : '');
    document.getElementById('streak-msg').textContent =
      streak === 0 ? 'Start your streak today!'
      : streak < 3 ? 'Keep it up!'
      : streak < 7 ? 'Nice momentum! 💪'
      : streak < 14 ? 'You\'re on fire! 🔥'
      : 'Incredible dedication! ⭐';
  }

  /* ---- COMPANY PILL ---- */
  function updateCompanyPill(company) {
    const pill = document.getElementById('company-pill');
    if (company) {
      pill.textContent = company;
      pill.style.display = 'block';
    } else {
      pill.style.display = 'none';
    }
  }

  /* ---- SESSION LIST ITEM (shared between recent + full list) ---- */
  function sessionHTML(s, showDelete) {
    const h = Math.floor(s.duration / 3600);
    const m = Math.floor((s.duration % 3600) / 60);
    const dur = h > 0 ? h + 'h ' + m + 'm' : m + 'm';
    const timeIn = new Date(s.start).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
    return `
      <div class="session-item" data-id="${s.id}">
        <div class="session-left">
          <div class="session-dot"></div>
          <div>
            <div class="session-name">${s.weekday}</div>
            <div class="session-date">${s.date} · ${timeIn}</div>
          </div>
        </div>
        <div class="session-duration">${dur}</div>
      </div>`;
  }

  /* ---- RECENT SESSIONS (dashboard) ---- */
  function renderRecentSessions(sessions) {
    const el = document.getElementById('recent-sessions-list');
    if (!el) return;
    const recent = sessions.slice(0, 3);
    if (recent.length === 0) {
      el.innerHTML = `<div class="empty-state">
        <div class="empty-icon">◷</div>
        <div class="empty-title">No sessions yet</div>
        <div class="empty-sub">Check in to start tracking your hours</div>
      </div>`;
      return;
    }
    el.innerHTML = recent.map(s => sessionHTML(s, false)).join('');
  }

  /* ---- FULL SESSIONS PAGE ---- */
  function renderSessions(sessions) {
    const el = document.getElementById('sessions-list');
    const badge = document.getElementById('session-count-badge');
    if (!el) return;
    if (badge) badge.textContent = sessions.length;

    if (sessions.length === 0) {
      el.innerHTML = `<div class="empty-state">
        <div class="empty-icon">◷</div>
        <div class="empty-title">No sessions yet</div>
        <div class="empty-sub">Head to the Dashboard and check in to start logging hours</div>
      </div>`;
      return;
    }
    el.innerHTML = sessions.map(s => sessionHTML(s, true)).join('');
  }

  /* ---- INSIGHTS ---- */
  function renderInsights(state, calcStreak, weekSecs) {
    const sessions = state.sessions || [];
    const total = sessions.reduce((a, s) => a + s.duration, 0);
    const req   = state.requiredHours || 0;
    const remH  = Math.max(0, req - total / 3600).toFixed(1);
    const pct   = req > 0 ? Math.min(100, (total / req) * 100).toFixed(0) : 0;
    const avgSecs = sessions.length > 0 ? Math.round(total / sessions.length) : 0;

    const rows = [
      ['Total hours rendered', (total / 3600).toFixed(1) + 'h'],
      ['Required hours',       req + 'h'],
      ['Hours remaining',      remH + 'h'],
      ['Completion',           pct + '%'],
      ['Total sessions',       sessions.length],
      ['Avg session length',   (avgSecs / 3600).toFixed(1) + 'h'],
      ['This week',            (weekSecs / 3600).toFixed(1) + 'h'],
      ['Current streak',       calcStreak() + ' days'],
    ];

    document.getElementById('insights-body').innerHTML = rows.map(([k, v]) =>
      `<div class="insight-row">
        <span class="insight-key">${k}</span>
        <span class="insight-val">${v}</span>
      </div>`
    ).join('');

    // Forecast
    const daily = state.dailyTarget || 8;
    let forecastHTML = '<p class="forecast-text">Complete at least one session and configure your required hours to see your forecast.</p>';
    if (sessions.length > 0 && req > 0 && daily > 0) {
      const remHNum = Math.max(0, req - total / 3600);
      if (remHNum <= 0) {
        forecastHTML = '<p class="forecast-complete">🎉 You have completed all your OJT hours!</p>';
      } else {
        const remDays = Math.ceil(remHNum / daily);
        const finDate = new Date();
        finDate.setDate(finDate.getDate() + remDays);
        const finStr = finDate.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
        forecastHTML = `<p class="forecast-text">
          At <strong>${daily}h/day</strong>, you'll finish in
          <strong>${remDays} day${remDays !== 1 ? 's' : ''}</strong>
          — around <strong>${finStr}</strong>.
        </p>`;
      }
    }
    document.getElementById('forecast-body').innerHTML = forecastHTML;

    // Week chart
    renderWeekChart(sessions);
  }

  /* ---- WEEK BAR CHART ---- */
  function renderWeekChart(sessions) {
    const el = document.getElementById('week-chart');
    if (!el) return;
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const today = new Date().getDay();

    // bucket seconds per weekday (current week)
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const buckets = Array(7).fill(0);
    sessions.forEach(s => {
      const d = new Date(s.start);
      if (d >= weekStart) buckets[d.getDay()] += s.duration;
    });

    const maxSecs = Math.max(...buckets, 1);
    el.innerHTML = days.map((label, i) => {
      const pct = Math.round((buckets[i] / maxSecs) * 80); // max 80px height
      const isToday = i === today;
      return `
        <div class="week-bar-wrap">
          <div class="week-bar${isToday ? ' today' : ''}" style="height:${Math.max(4, pct)}px;" title="${(buckets[i]/3600).toFixed(1)}h"></div>
          <span class="week-day-label${isToday ? ' today' : ''}">${label}</span>
        </div>`;
    }).join('');
  }

  /* ---- SETTINGS LOAD ---- */
  function loadSettingsForm(state) {
    document.getElementById('company-input').value = state.company      || '';
    document.getElementById('school-input').value  = state.school       || '';
    document.getElementById('hours-input').value   = state.requiredHours || '';
    document.getElementById('daily-input').value   = state.dailyTarget   || '';
  }

  /* ---- THEME ---- */
  function applyTheme(isDark) {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    document.getElementById('theme-icon').textContent = isDark ? '☀' : '☾';
  }

  return {
    toast, setPage, updateGreeting,
    setHeroActive, updateProgress, updateStats, updateStreak,
    updateCompanyPill, renderRecentSessions, renderSessions,
    renderInsights, loadSettingsForm, applyTheme
  };
})();
