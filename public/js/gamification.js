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
    const badges = [
      ['first', 'First Day', '🌱', 'Log your first OJT day.', dates.length, 1, 25],
      ['full', 'Full Day', '⭐', 'Complete an 8-hour day. Overtime adds no extra XP.', fullDays, 1, 25],
      ['reflection', 'First Reflection', '📝', 'Add an accomplishment in your shift notes.', accomplishments, 1, 25],
      ['streak3', 'Finding Rhythm', '🔥', 'Build a 3-day attendance streak.', streak.best, 3, 50],
      ['streak5', '5-Day Streak', '🔥', 'Build a 5-day attendance streak.', streak.best, 5, 100],
      ['streak10', 'Consistent Contributor', '💪', 'Build a 10-day attendance streak.', streak.best, 10, 150],
      ['streak20', 'Consistency Champion', '🏅', 'Build a 20-day attendance streak.', streak.best, 20, 250],
      ['journal', 'Growth Journal', '📚', 'Record accomplishments on 10 different days.', accomplishments, 10, 100],
      ['quarter', 'Getting There', '🚀', 'Complete 25% of your required OJT hours.', totalHours, target === null ? null : target * 0.25, 75],
      ['half', 'Halfway Hero', '🎯', 'Complete 50% of your required OJT hours.', totalHours, target === null ? null : target * 0.5, 150],
      ['finish', 'OJT Finisher', '🏆', 'Complete all your required OJT hours.', totalHours, target, 300],
    ].map(([id, name, icon, description, value, goal, xp]) => ({
      id, name, icon, description, value, goal, xp, waitingForTarget: goal === null,
      earned: goal !== null && value >= goal,
      progress: goal === null ? 0 : Math.min(100, Math.floor(value / goal * 100)),
    }));
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

  return { calculate, dateKey, LEVELS };
})();

if (typeof module !== 'undefined') module.exports = Gamification;
