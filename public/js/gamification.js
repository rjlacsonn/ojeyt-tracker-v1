/* Rewards are derived from saved shifts, so edits, reloads and devices agree. */
const Gamification = (() => {
  const LEVELS = [
    { name: 'New Intern', xp: 0 },
    { name: 'Rising Intern', xp: 250 },
    { name: 'Dedicated Intern', xp: 750 },
    { name: 'Skilled Contributor', xp: 1500 },
    { name: 'OJT Trailblazer', xp: 3000 },
    { name: 'Intern Champion', xp: 5000 },
  ];
  const DEFAULT_BADGES = [
    { id: 'first', name: 'First Day', icon: '🌱', description: 'Log your first OJT day.', metric: 'attendance_days', goal: 1, xp: 25, order: 1 },
    { id: 'full', name: 'Full Day', icon: '⭐', description: 'Complete an 8-hour day. Overtime adds no extra XP.', metric: 'full_days', goal: 1, xp: 25, order: 2 },
    { id: 'reflection', name: 'First Reflection', icon: '📝', description: 'Add an accomplishment in your shift notes.', metric: 'accomplishment_days', goal: 1, xp: 25, order: 3 },
    { id: 'streak3', name: 'Finding Rhythm', icon: '🔥', description: 'Build a 3-day attendance streak.', metric: 'best_streak', goal: 3, xp: 50, order: 4 },
    { id: 'streak5', name: '5-Day Streak', icon: '🔥', description: 'Build a 5-day attendance streak.', metric: 'best_streak', goal: 5, xp: 100, order: 5 },
    { id: 'streak10', name: 'Consistent Contributor', icon: '💪', description: 'Build a 10-day attendance streak.', metric: 'best_streak', goal: 10, xp: 150, order: 6 },
    { id: 'streak20', name: 'Consistency Champion', icon: '🏅', description: 'Build a 20-day attendance streak.', metric: 'best_streak', goal: 20, xp: 250, order: 7 },
    { id: 'journal', name: 'Growth Journal', icon: '📚', description: 'Record accomplishments on 10 different days.', metric: 'accomplishment_days', goal: 10, xp: 100, order: 8 },
    { id: 'quarter', name: 'Getting There', icon: '🚀', description: 'Complete 25% of your required OJT hours.', metric: 'hours_percent', goal: 25, xp: 75, order: 9 },
    { id: 'half', name: 'Halfway Hero', icon: '🎯', description: 'Complete 50% of your required OJT hours.', metric: 'hours_percent', goal: 50, xp: 150, order: 10 },
    { id: 'finish', name: 'OJT Finisher', icon: '🏆', description: 'Complete all your required OJT hours.', metric: 'hours_percent', goal: 100, xp: 300, order: 11 },
  ];
  const badgeDefinitions = DEFAULT_BADGES.map(badge => ({ ...badge }));
  const metrics = new Set(['attendance_days', 'full_days', 'accomplishment_days', 'best_streak', 'current_streak', 'total_hours', 'hours_percent']);

  function setBadges(next) {
    if (!Array.isArray(next) || !next.length) throw new Error('At least one active badge is required.');
    const normalized = next.map((badge, index) => ({
      id: String(badge.id || badge.badge_id || ''), name: String(badge.name || badge.badge_name || ''),
      icon: String(badge.icon || '🏅'), description: String(badge.description || ''),
      metric: String(badge.metric || badge.metric_type || ''), goal: Number(badge.goal ?? badge.goal_value),
      xp: Number(badge.xp ?? badge.xp_reward), order: Number(badge.order ?? badge.display_order ?? index + 1),
    })).filter(badge => badge.id && badge.name && badge.description && metrics.has(badge.metric) &&
      Number.isFinite(badge.goal) && badge.goal > 0 && Number.isInteger(badge.xp) && badge.xp >= 0);
    if (normalized.length !== next.length || new Set(normalized.map(badge => badge.id)).size !== normalized.length) {
      throw new Error('The badge configuration is invalid.');
    }
    normalized.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    badgeDefinitions.splice(0, badgeDefinitions.length, ...normalized);
  }
  function resetBadges() { badgeDefinitions.splice(0, badgeDefinitions.length, ...DEFAULT_BADGES.map(badge => ({ ...badge }))); }

  function dateKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function moveDay(key, offset) {
    const date = new Date(`${key}T12:00:00`);
    date.setDate(date.getDate() + offset);
    return dateKey(date);
  }

  function isWorkday(key, holidays) {
    const day = new Date(`${key}T12:00:00`).getDay();
    return day !== 0 && day !== 6 && !holidays.has(key);
  }

  function streakFor(dates, today, holidays) {
    let best = 0;
    let run = 0;
    let previous = null;
    for (const date of dates) {
      let connected = true;
      if (previous) {
        for (let cursor = moveDay(previous, 1); cursor < date; cursor = moveDay(cursor, 1)) {
          if (isWorkday(cursor, holidays)) { connected = false; break; }
        }
      }
      run = connected ? run + 1 : 1;
      best = Math.max(best, run);
      previous = date;
    }
    // Today stays available to complete; only an earlier missed workday breaks a run.
    let current = run;
    if (previous) {
      for (let cursor = moveDay(previous, 1); cursor < today; cursor = moveDay(cursor, 1)) {
        if (isWorkday(cursor, holidays)) { current = 0; break; }
      }
    }
    return { current, best };
  }

  function calculate(shifts, requiredHours, now = new Date(), holidays = new Set()) {
    const today = dateKey(now);
    const days = new Map();
    for (const shift of shifts) {
      const date = String(shift.date || '');
      const hours = Number(shift.total_hours);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today ||
          dateKey(new Date(`${date}T12:00:00`)) !== date ||
          !Number.isFinite(hours) || hours <= 0 || hours > 24) continue;
      const day = days.get(date) || { hours: 0, accomplishment: false };
      day.hours = Math.min(24, day.hours + hours);
      day.accomplishment ||= Boolean(String(shift.notes || '').trim());
      days.set(date, day);
    }
    const dates = [...days.keys()].sort();
    const streak = streakFor(dates, today, holidays);
    const totalHours = [...days.values()].reduce((sum, day) => sum + day.hours, 0);
    const target = Number.isFinite(Number(requiredHours)) && Number(requiredHours) > 0 ? Number(requiredHours) : null;
    const accomplishments = [...days.values()].filter(day => day.accomplishment).length;
    const fullDays = [...days.values()].filter(day => day.hours >= 8).length;
    const metricValues = { attendance_days: dates.length, full_days: fullDays, accomplishment_days: accomplishments,
      best_streak: streak.best, current_streak: streak.current, total_hours: totalHours };
    const badges = badgeDefinitions.map(definition => {
      const waitingForTarget = definition.metric === 'hours_percent' && target === null;
      const value = definition.metric === 'hours_percent' ? totalHours : metricValues[definition.metric];
      const goal = definition.metric === 'hours_percent' && target !== null ? target * definition.goal / 100 :
        waitingForTarget ? null : definition.goal;
      return { ...definition, value, goal, waitingForTarget,
      earned: goal !== null && value >= goal,
      progress: goal === null ? 0 : Math.min(100, Math.floor(value / goal * 100)),
      };
    });
    const attendanceXP = dates.length * 50;
    const accomplishmentXP = accomplishments * 25;
    const badgeXP = badges.filter(b => b.earned).reduce((sum, b) => sum + b.xp, 0);
    const xp = attendanceXP + accomplishmentXP + badgeXP;
    const levelIndex = LEVELS.findLastIndex(level => xp >= level.xp);
    const level = LEVELS[levelIndex];
    const nextLevel = LEVELS[levelIndex + 1] || null;
    const levelProgress = nextLevel ? (xp - level.xp) / (nextLevel.xp - level.xp) * 100 : 100;
    const todayDay = days.get(today);
    const dailyDone = Number(Boolean(todayDay)) + Number(Boolean(todayDay?.accomplishment));
    const monday = moveDay(today, -((now.getDay() + 6) % 7));
    const weekDays = dates.filter(date => date >= monday).length;
    return { today, streak, badges, xp, level, levelIndex, nextLevel, levelProgress,
      attendanceXP, accomplishmentXP, badgeXP, dailyDone, weekDays };
  }

  return { calculate, dateKey, setBadges, resetBadges, badgeDefinitions, LEVELS };
})();

if (typeof module !== 'undefined') module.exports = Gamification;
