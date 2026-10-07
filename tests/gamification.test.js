const Gamification = require('../public/js/gamification.js');

function runTests() {
  const passed = [];
  function test(name, fn) { fn(); passed.push(name); }
  function equal(actual, expected) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  }
  const shift = (date, hours = 8, notes = '') => ({ date, total_hours: hours, notes });
  const calculate = (shifts, today = '2026-10-07', target = 200, holidays = new Set()) =>
    Gamification.calculate(shifts, target, new Date(`${today}T12:00:00`), holidays);
  const earned = (result, id) => result.badges.find(b => b.id === id).earned;

  test('Empty account starts at zero', () => {
    const r = calculate([]);
    equal([r.xp, r.streak.current, r.streak.best, r.dailyDone, r.levelIndex], [0, 0, 0, 0, 0]);
  });
  test('First day awards attendance and two milestone bonuses', () => {
    const r = calculate([shift('2026-10-07')]);
    equal([r.xp, r.dailyDone, r.weekDays], [100, 1, 1]);
  });
  test('Accomplishment completes the daily mission', () => {
    const r = calculate([shift('2026-10-07', 8, 'Built the inventory form')]);
    equal([r.xp, r.dailyDone, r.accomplishmentXP], [150, 2, 25]);
  });
  test('Whitespace does not count as an accomplishment', () => {
    equal(calculate([shift('2026-10-07', 8, '  ')]).dailyDone, 1);
  });
  test('Overtime adds no extra attendance or accomplishment XP', () => {
    equal(calculate([shift('2026-10-07', 8)]).xp, calculate([shift('2026-10-07', 12)]).xp);
  });
  test('Duplicate dates award daily XP only once', () => {
    const r = calculate([shift('2026-10-07', 4, 'A'), shift('2026-10-07', 4, 'B')]);
    equal([r.attendanceXP, r.accomplishmentXP, r.streak.best], [50, 25, 1]);
  });
  test('Future, invalid and zero-hour records earn nothing', () => {
    const r = calculate([shift('2026-10-08'), shift('2026-02-30'), shift('bad'),
      shift('2026-10-07', 0), shift('2026-10-06', -1), shift('2026-10-05', 'bad'), shift('2026-10-04', 25)]);
    equal(r.xp, 0);
  });
  test('Weekends preserve Friday streak through Monday', () => {
    const rows = [shift('2026-10-01'), shift('2026-10-02')];
    for (const today of ['2026-10-03', '2026-10-04', '2026-10-05']) {
      equal(calculate(rows, today).streak, { current: 2, best: 2 });
    }
    equal(calculate([...rows, shift('2026-10-05')], '2026-10-05').streak, { current: 3, best: 3 });
  });
  test('A missed workday breaks current streak but retains best', () => {
    equal(calculate([shift('2026-10-01'), shift('2026-10-02')], '2026-10-06').streak, { current: 0, best: 2 });
  });
  test('Configured holidays preserve a streak', () => {
    const r = calculate([shift('2026-10-02'), shift('2026-10-06')], '2026-10-06', 200, new Set(['2026-10-05']));
    equal(r.streak, { current: 2, best: 2 });
  });
  test('Weekend attendance counts without requiring weekend work', () => {
    equal(calculate([shift('2026-10-02'), shift('2026-10-03'), shift('2026-10-05')], '2026-10-05').streak.best, 3);
  });
  test('Five-day streak unlocks once and remains after a missed day', () => {
    const rows = ['01', '02', '05', '06', '07'].map(d => shift(`2026-10-${d}`));
    const r = calculate(rows);
    equal([r.streak.best, earned(r, 'streak5'), r.levelIndex], [5, true, 1]);
    equal(earned(calculate(rows, '2026-10-09'), 'streak5'), true);
    equal(calculate(rows).xp, r.xp);
  });
  test('Weekly goal resets on Monday', () => {
    equal(calculate([shift('2026-10-02')], '2026-10-05').weekDays, 0);
  });
  test('Progress badges follow required hours', () => {
    const rows = [shift('2026-10-06'), shift('2026-10-07')];
    equal([earned(calculate(rows, '2026-10-07', 32), 'half'), earned(calculate(rows, '2026-10-07', 16), 'finish')], [true, true]);
    equal(earned(calculate(rows, '2026-10-07', 200), 'half'), false);
  });
  test('Unassigned targets never award completion badges or their XP', () => {
    const rows = Array.from({ length: 10 }, (_, i) => shift(`2026-09-${String(i + 1).padStart(2, '0')}`, 24));
    for (const target of [null, 0, '', NaN, Infinity]) {
      const r = calculate(rows, '2026-10-07', target);
      const progress = r.badges.filter(b => ['quarter', 'half', 'finish'].includes(b.id));
      equal(progress.map(b => [b.earned, b.progress, b.waitingForTarget]), Array(3).fill([false, 0, true]));
      equal(r.badgeXP, r.badges.filter(b => b.earned && !progress.includes(b)).reduce((sum, b) => sum + b.xp, 0));
    }
  });
  test('Attendance rewards work without a target and completion unlocks after allocation', () => {
    const rows = [shift('2026-10-07', 8, 'Completed tasks')];
    const unassigned = calculate(rows, '2026-10-07', null);
    equal([unassigned.attendanceXP, unassigned.accomplishmentXP, earned(unassigned, 'first')], [50, 25, true]);
    equal(earned(unassigned, 'finish'), false);
    equal(earned(calculate(rows, '2026-10-07', 8), 'finish'), true);
  });
  test('Deletion and note removal recalculate rewards', () => {
    const withNote = calculate([shift('2026-10-07', 8, 'Done')]);
    equal(withNote.xp - calculate([shift('2026-10-07')]).xp, 50);
    equal(calculate([]).xp, 0);
  });
  test('Numeric strings are supported', () => {
    equal(calculate([shift('2026-10-07', '8.00')]).xp, 100);
  });
  test('Highest level has a complete progress bar', () => {
    const rows = [];
    for (let i = 1; i <= 100; i++) {
      const date = new Date(2026, 0, i, 12);
      rows.push(shift(Gamification.dateKey(date), 8, 'Completed assigned tasks'));
    }
    const r = calculate(rows);
    equal([r.nextLevel, r.levelProgress, r.level.name], [null, 100, 'Intern Champion']);
  });
  test('Dates use local calendar day rather than UTC', () => {
    equal(Gamification.dateKey(new Date(2026, 9, 7, 0, 5)), '2026-10-07');
  });
  return passed;
}

module.exports = runTests;
if (require.main === module) console.log(`${runTests().length} gamification checks passed.`);
