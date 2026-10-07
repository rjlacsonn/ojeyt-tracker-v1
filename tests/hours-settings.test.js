const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');
const saveSource = source.slice(source.indexOf('async function saveSettings()'), source.indexOf('// === PROFILE PICTURE FUNCTIONS ==='));

async function runTests() {
  const passed = [];
  const assert = (value, message) => { if (!value) throw new Error(message); };
  for (const role of ['student', 'professor']) {
    for (const target of [500, null]) {
    const user = { id: role, fullName: 'Old name', requiredHours: target };
    let payload, filter;
    const client = { from: () => ({ update(data) { payload = data; return { async eq(key, value) { filter = [key, value]; return { error: null }; } }; } }) };
    const save = new Function('currentUser', 'document', 'supabase', 'setButtonLoading', 'showToast', 'updateDashboard', 'navTo', `${saveSource}\nreturn saveSettings;`)(
      user, { getElementById: id => ({ value: id === 'settings-name-input' ? 'New name' : '1' }) }, client,
      () => {}, () => {}, () => {}, () => {});
    await save();
    assert(user.fullName === 'New name' && user.requiredHours === target, 'Profile edit changed target');
    assert(payload.full_name === 'New name' && !('required_hours' in payload), 'Profile edit sent student-controlled hours');
    assert(filter[0] === 'id' && filter[1] === role, 'Wrong profile updated');
    passed.push(`${role} profile edit preserves ${target === null ? 'unassigned' : 'allocated'} hours even if read-only input is tampered with`);
    }
  }
  const dashboardSource = source.slice(source.indexOf('function updateDashboard('), source.indexOf('// === STREAK COUNTER ==='));
  for (const target of [null, 16]) {
    const elements = new Map();
    const get = id => {
      if (!elements.has(id)) elements.set(id, { textContent: '', style: {}, classList: { toggle() {} } });
      return elements.get(id);
    };
    const update = new Function('currentUser', 'allShifts', 'document', 'RING_CIRCUMFERENCE', 'getFirstName',
      'calculateEstimatedFinish', 'updateAvgTargetIndicator', 'calculateStreak', 'renderMonthlyChart',
      'renderWeeklyChart', 'renderShiftHistory', 'renderGamification', `${dashboardSource}\nreturn updateDashboard;`)(
        { accountType: 'student', accountStatus: 'active', fullName: 'Student', requiredHours: target }, [{ total_hours: 8, date: '2026-10-07' }],
        { getElementById: get }, 364.42, () => 'Student', () => new Date(), () => {}, () => ({ current: 1, best: 1 }),
        () => {}, () => {}, () => {}, () => {});
    update();
    if (target === null) {
      assert(get('progress-percent').textContent === 'Not assigned' && get('hours-remaining').textContent === 'Not assigned', 'Unassigned target displayed as a number');
      assert(get('hours-rendered').textContent === '8.0 hrs logged' && get('estimated-finish').textContent.includes('has not assigned'), 'Unassigned target lost logged hours or marked complete');
      assert(get('ojt-progress-bar-fill').style.width === '0%', 'Unassigned target filled progress bar');
    } else {
      assert(get('progress-percent').textContent === '50%' && get('hours-remaining').textContent === '8h', 'Assigned target progress incorrect');
    }
    passed.push(`Dashboard shows ${target === null ? 'unassigned target while preserving logged hours' : 'progress against professor allocation'}`);
  }
  return passed;
}
module.exports = runTests;
if (require.main === module) runTests().then(passed => console.log(`${passed.length} settings checks passed.`)).catch(error => { console.error(error); process.exitCode = 1; });
