const activity = require('../public/js/shift-activity.js');
function runTests() {
  const passed = [];
  const equal = (actual, expected) => { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); };
  const test = (name, fn) => { fn(); passed.push(name); };
  const now = new Date('2026-10-11T12:00:00Z');
  const row = (id, created_at, date = '2026-09-01') => ({ id, created_at, date, total_hours: 8 });
  const build = (rows, days) => activity.build(rows, now, days);
  test('Empty account has a full year of empty days and no fabricated last save', () => {
    const data = build([]);
    equal([data.cells.filter(c => c.available).length, data.total, data.activeDays, data.lastSaved, data.gap], [365, 0, 0, null, null]);
  });
  test('Backdated work counts on its actual creation day', () => {
    const data = build([row('a', '2026-10-10T04:00:00Z', '2026-08-01')]);
    equal(data.cells.find(c => c.key === '2026-10-10').count, 1);
    equal(data.cells.find(c => c.key === '2026-08-01').count, 0);
    equal([data.lastSaved, data.gap], ['2026-10-10', 1]);
  });
  test('Several new shifts saved in a day increase intensity, not active day count', () => {
    const data = build(Array.from({ length: 5 }, (_, i) => row('a' + i, '2026-10-11T01:00:00Z')));
    equal([data.total, data.activeDays, data.cells.find(c => c.key === data.today).level], [5, 1, 4]);
  });
  test('Duplicate record IDs are not double counted', () => equal(build([row('a', '2026-10-10T01:00:00Z'), row('a', '2026-10-10T01:00:00Z')]).total, 1));
  test('A UTC evening save belongs to the next day in Manila', () => {
    equal(activity.dateKey('2026-10-10T16:00:00Z'), '2026-10-11');
    equal(activity.dateKey('2026-10-10T15:59:59Z'), '2026-10-10');
  });
  test('Missing and invalid timestamps are excluded rather than inferred from work dates', () => {
    const data = build([row('a', null), row('b', 'invalid'), row('c', '2026-10-10')]);
    equal([data.unknown, data.total, data.lastSaved], [3, 0, null]);
  });
  test('Editing a record does not invent a second historical save', () => equal(build([{ ...row('a', '2026-10-01T04:00:00Z'), updated_at: '2026-10-11T01:00:00Z' }]).lastSaved, '2026-10-01'));
  test('Future save timestamps are excluded even if they fall later today', () => equal(build([row('a', '2026-10-11T13:00:00Z'), row('b', '2026-10-12T01:00:00Z')]).total, 0));
  test('Ninety-day range counts only records inside its inclusive boundaries', () => {
    const data = build([], 90);
    const filled = build([row('a', data.start + 'T01:00:00Z'), row('b', '2026-01-01T01:00:00Z'), row('c', '2026-10-11T01:00:00Z')], 90);
    equal([filled.cells.filter(c => c.available).length, filled.total, filled.activeDays], [90, 2, 2]);
  });
  test('Weeks align Sunday through Saturday; padding never carries activity', () => {
    const data = build([]);
    equal(new Date(data.cells[0].key + 'T00:00:00Z').getUTCDay(), 0);
    equal(data.cells.length % 7, 0);
    equal(data.cells.filter(c => !c.available).every(c => c.count === 0), true);
  });
  test('Leap-day saves are included when inside the rolling year', () => {
    const data = activity.build([row('a', '2024-02-29T01:00:00Z')], new Date('2024-03-01T01:00:00Z'));
    equal([data.total, data.gap], [1, 1]);
  });
  test('An old save remains the last activity without inflating the displayed period', () => {
    const data = build([row('a', '2025-01-01T01:00:00Z')]);
    equal([data.total, data.activeDays, data.lastSaved, data.gap > 365], [0, 0, '2025-01-01', true]);
  });
  return passed;
}
module.exports = runTests;
