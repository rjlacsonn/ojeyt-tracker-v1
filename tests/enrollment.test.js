const fs = require('fs');
const path = require('path');
const model = require('../public/js/documents-model.js');
const source = fs.readFileSync(path.join(__dirname, '../public/js/enrollment.js'), 'utf8');

function createApp(role = 'student', options = {}) {
  const user = { id: role, accountType: role, accountStatus: role === 'student' ? 'pending' : 'active' };
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, { innerHTML: '', replaceChildren() { this.innerHTML = ''; } });
    return elements.get(id);
  };
  const state = { calls: [], notices: [], refreshes: 0, roster: options.roster || [], failure: null, deferred: null,
    rpcFailures: {}, rpcRejections: {} };
  const client = {
    async rpc(name, args) {
      state.calls.push([name, args]);
      if (state.deferred) await state.deferred;
      if (state.rpcRejections[name]) throw new Error(state.rpcRejections[name]);
      if (state.rpcFailures[name]) return { error: { message: state.rpcFailures[name] } };
      if (state.failure) return { error: { message: state.failure } };
      if (name === 'ojt_document_context') return { data: { join_code: 'ABCDEF123456' } };
      if (name === 'ojt_list_students') return { data: state.roster.map(row => ({ ...row })) };
      if (name === 'ojt_approve_student') {
        const student = state.roster.find(row => row.student_id === args.p_student_id);
        student.approval_status = 'approved'; return { error: null };
      }
      if (name === 'ojt_set_student_hours') {
        const student = state.roster.find(row => row.student_id === args.p_student_id);
        student.required_hours = args.p_hours; return { error: null };
      }
      if (name === 'ojt_join_coordinator') return { error: null };
      throw new Error(`Unexpected RPC: ${name}`);
    },
  };
  let api;
  api = new Function('DocumentRequirements', 'document', 'currentUser', 'supabase', 'loadUserData', 'showAppUI', 'showToast', `${source}\nreturn Enrollment;`)(
    model, { getElementById: get, addEventListener() {} }, user, client,
    async () => { state.refreshes++; user.recipientId = 'professor'; user.recipientName = 'Maam Geece'; },
    async () => { api.reset(); api.openStudent(); }, message => state.notices.push(message));
  return { api, user, state, get };
}

async function runTests() {
  const passed = [];
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const test = async (name, fn) => { await fn(); passed.push(name); };
  const request = { student_id: 'student-a', full_name: 'Student A', email: 'a@example.edu', approval_status: 'pending', required_hours: 200, logged_hours: 0 };
  await test('New student can request approval using a professor code', async () => {
    const a = createApp(); a.api.openStudent();
    assert(a.get('student-approval-content').innerHTML.includes('Request approval'), 'No approval request UI');
    await a.api.requestApproval(' abcdef123456 ');
    assert(a.state.calls[0][1].p_code === 'ABCDEF123456' && a.state.refreshes === 1, 'Request not sent or access not refreshed');
    assert(a.get('student-approval-content').innerHTML.includes('Maam Geece') && a.user.accountStatus === 'pending', 'Student prematurely activated');
  });
  await test('Invalid coordinator code never reaches Supabase', async () => {
    const a = createApp(); await a.api.requestApproval('bad');
    assert(!a.state.calls.length && a.get('student-approval-content').innerHTML.includes('valid coordinator code'), 'Invalid code accepted');
  });
  await test('Professor sees coordinator code and pending students', async () => {
    const a = createApp('professor', { roster: [request] }); await a.api.openProfessor();
    const html = a.get('professor-students-content').innerHTML;
    assert(html.includes('ABCDEF123456') && html.includes('Approve student') && html.includes('Student A'), 'Professor approvals missing');
  });
  await test('Roster query failure preserves coordinator code without false empty counts', async () => {
    const a = createApp('professor');
    a.state.rpcFailures.ojt_list_students = 'structure of query does not match function result type';
    await a.api.openProfessor();
    const html = a.get('professor-students-content').innerHTML;
    assert(html.includes('ABCDEF123456') && html.includes('Student list could not be loaded'), 'Code hidden by roster failure');
    assert(!html.includes('Loading…') && !html.includes('No students are waiting'), 'Failure displayed as loading or empty roster');
    assert(html.includes('structure of query'), 'Roster error hidden');
  });
  await test('Rejected roster request preserves successful coordinator code', async () => {
    const a = createApp('professor'); a.state.rpcRejections.ojt_list_students = 'Network unavailable';
    await a.api.openProfessor();
    const html = a.get('professor-students-content').innerHTML;
    assert(html.includes('ABCDEF123456') && html.includes('Network unavailable'), 'Rejected roster discarded code');
  });
  await test('Coordinator query failure still displays successfully loaded students', async () => {
    const a = createApp('professor', { roster: [{ ...request }] });
    a.state.rpcFailures.ojt_document_context = 'Connection lost'; await a.api.openProfessor();
    const html = a.get('professor-students-content').innerHTML;
    assert(html.includes('Unavailable') && html.includes('Student A') && html.includes('Approve student'), 'Roster hidden by code failure');
    assert(!html.includes('Loading…'), 'Code remains loading after failure');
  });
  await test('Refresh recovers from roster error and shows genuine empty state', async () => {
    const a = createApp('professor'); a.state.rpcFailures.ojt_list_students = 'Temporary error';
    await a.api.openProfessor(); delete a.state.rpcFailures.ojt_list_students; await a.api.openProfessor();
    const html = a.get('professor-students-content').innerHTML;
    assert(html.includes('No students are waiting') && !html.includes('Temporary error'), 'Roster did not recover');
  });
  await test('Approval moves a student from pending to approved', async () => {
    const a = createApp('professor', { roster: [{ ...request }] }); await a.api.openProfessor(); await a.api.approve('student-a');
    assert(a.state.calls.some(c => c[0] === 'ojt_approve_student' && c[1].p_student_id === 'student-a'), 'Wrong approval RPC');
    const html = a.get('professor-students-content').innerHTML;
    assert(a.state.roster[0].approval_status === 'approved' && !html.includes('data-enrollment-action="approve"'), 'Approved student still pending');
  });
  await test('Student cannot open professor queue or approve accounts', async () => {
    const a = createApp(); await a.api.openProfessor(); await a.api.approve('student-a');
    assert(!a.state.calls.length, 'Student attempted professor RPC');
  });
  await test('Professor cannot approve an unknown student', async () => {
    const a = createApp('professor', { roster: [{ ...request }] }); await a.api.openProfessor(); await a.api.approve('other-student');
    assert(!a.state.calls.some(c => c[0] === 'ojt_approve_student'), 'Unknown student approved');
  });
  await test('Professor cannot enroll as a student from the client', async () => {
    const a = createApp('professor'); await a.api.requestApproval('ABCDEF123456');
    assert(!a.state.calls.length, 'Professor attempted enrollment');
  });
  await test('Student names are escaped in professor queue', async () => {
    const a = createApp('professor', { roster: [{ ...request, full_name: '<script>bad</script>' }] }); await a.api.openProfessor();
    assert(!a.get('professor-students-content').innerHTML.includes('<script>bad'), 'Unsafe student name');
  });
  await test('Failed approval stays pending and reports error', async () => {
    const a = createApp('professor', { roster: [{ ...request }] }); await a.api.openProfessor(); a.state.failure = 'Connection lost'; await a.api.approve('student-a');
    assert(a.state.roster[0].approval_status === 'pending' && a.get('professor-students-content').innerHTML.includes('Connection lost'), 'Failed approval falsely succeeded');
  });
  await test('Reset ignores late roster results from a previous account', async () => {
    const a = createApp('professor', { roster: [{ ...request }] });
    let release; a.state.deferred = new Promise(resolve => { release = resolve; });
    const pending = a.api.openProfessor(); a.api.reset(); a.user.id = 'another-professor'; release(); await pending;
    assert(a.get('professor-students-content').innerHTML === '', 'Previous roster leaked after account change');
  });
  await test('Refresh ignores a different signed-in user', async () => {
    const a = createApp(); await a.api.refreshAccess('another-student');
    assert(a.state.refreshes === 0, 'Wrong account refreshed');
  });
  await test('Professor allocates hours for pending and approved students', async () => {
    for (const status of ['pending', 'approved']) {
      const a = createApp('professor', { roster: [{ ...request, approval_status: status }] });
      await a.api.openProfessor(); await a.api.setHours('student-a', '500');
      assert(a.state.roster[0].required_hours === 500 && a.get('professor-students-content').innerHTML.includes('value="500"'), 'Allocation not reflected');
      assert(a.state.calls.some(([name, args]) => name === 'ojt_set_student_hours' && args.p_hours === 500 && args.p_student_id === 'student-a'), 'Wrong hours request');
    }
  });
  await test('Student starts unassigned until professor saves their first target', async () => {
    const a = createApp('professor', { roster: [{ ...request, required_hours: null }] });
    await a.api.openProfessor();
    const html = a.get('professor-students-content').innerHTML;
    assert(html.includes('placeholder="Not assigned" value=""') && !html.includes('value="200"'), 'Unassigned student given a default');
    await a.api.setHours('student-a', 450);
    assert(a.state.roster[0].required_hours === 450 && a.get('professor-students-content').innerHTML.includes('value="450"'), 'First allocation failed');
  });
  await test('Professor sees assigned, logged, remaining hours and completion', async () => {
    const a = createApp('professor', { roster: [{ ...request, logged_hours: '80.00', approval_status: 'approved' }] });
    await a.api.openProfessor(); const html = a.get('professor-students-content').innerHTML;
    for (const pair of [['Assigned', '200h'], ['Logged', '80h'], ['Remaining', '120h'], ['Completion', '40%']]) {
      assert(html.includes(`<dt>${pair[0]}</dt><dd>${pair[1]}</dd>`), `Wrong ${pair[0]} summary`);
    }
    assert(html.includes('aria-valuenow="40"'), 'Accessible progress bar missing');
  });
  await test('Unassigned student keeps logged hours without invented progress', async () => {
    const a = createApp('professor', { roster: [{ ...request, required_hours: null, logged_hours: 24.5 }] });
    await a.api.openProfessor(); const html = a.get('professor-students-content').innerHTML;
    assert(html.includes('<dt>Logged</dt><dd>24.5h</dd>') && html.includes('<dt>Remaining</dt><dd>Not assigned</dd>'), 'Unassigned target lost logged hours');
    assert(html.includes('<dt>Completion</dt><dd>Not assigned</dd>') && !html.includes('role="progressbar"'), 'Unassigned student given completion percentage');
  });
  await test('Hours above the target show zero remaining and cap completion', async () => {
    const a = createApp('professor', { roster: [{ ...request, logged_hours: 240.5 }] });
    await a.api.openProfessor(); const html = a.get('professor-students-content').innerHTML;
    assert(html.includes('<dt>Logged</dt><dd>240.5h</dd>') && html.includes('<dt>Remaining</dt><dd>0h</dd>') && html.includes('aria-valuenow="100"'), 'Exceeded target displayed incorrectly');
  });
  await test('Zero logged hours is valid progress rather than missing data', async () => {
    const a = createApp('professor', { roster: [{ ...request }] }); await a.api.openProfessor();
    const html = a.get('professor-students-content').innerHTML;
    assert(html.includes('<dt>Logged</dt><dd>0h</dd>') && html.includes('<dt>Remaining</dt><dd>200h</dd>') && html.includes('aria-valuenow="0"'), 'Empty shift history misreported');
  });
  await test('Missing progress data never appears as zero logged hours', async () => {
    for (const logged of [undefined, null, 'invalid']) {
      const a = createApp('professor', { roster: [{ ...request, logged_hours: logged }] }); await a.api.openProfessor();
      const html = a.get('professor-students-content').innerHTML;
      assert(html.includes('<dt>Logged</dt><dd>Unavailable</dd>') && !html.includes('role="progressbar"'), 'Missing data reported as progress');
    }
  });
  await test('Changing the target immediately recalculates the progress summary', async () => {
    const a = createApp('professor', { roster: [{ ...request, logged_hours: 80 }] });
    await a.api.openProfessor(); await a.api.setHours('student-a', 400);
    const html = a.get('professor-students-content').innerHTML;
    assert(html.includes('<dt>Remaining</dt><dd>320h</dd>') && html.includes('aria-valuenow="20"'), 'Progress stale after changing target');
  });
  await test('Refresh updates logged hours and remaining progress', async () => {
    const a = createApp('professor', { roster: [{ ...request, logged_hours: 80 }] }); await a.api.openProfessor();
    a.state.roster[0].logged_hours = 100; await a.api.openProfessor();
    const html = a.get('professor-students-content').innerHTML;
    assert(html.includes('<dt>Remaining</dt><dd>100h</dd>') && html.includes('aria-valuenow="50"'), 'Progress stale after refresh');
  });
  await test('Students and inactive professors cannot allocate hours', async () => {
    const a = createApp('student'); await a.api.setHours('student-a', 500);
    assert(!a.state.calls.length, 'Student allocated hours');
    const b = createApp('professor', { roster: [{ ...request }] }); await b.api.openProfessor();
    b.user.accountStatus = 'pending'; await b.api.setHours('student-a', 500);
    assert(!b.state.calls.some(([name]) => name === 'ojt_set_student_hours'), 'Inactive professor allocated hours');
  });
  await test('Professor cannot allocate hours for an unknown student', async () => {
    const a = createApp('professor', { roster: [{ ...request }] }); await a.api.openProfessor(); await a.api.setHours('other', 500);
    assert(!a.state.calls.some(([name]) => name === 'ojt_set_student_hours'), 'Unknown student changed');
  });
  await test('Invalid allocations do not reach the database', async () => {
    const a = createApp('professor', { roster: [{ ...request }] }); await a.api.openProfessor();
    for (const value of ['', 0, -1, 1.5, 10001, NaN, Infinity, '500x']) await a.api.setHours('student-a', value);
    assert(!a.state.calls.some(([name]) => name === 'ojt_set_student_hours') && a.state.roster[0].required_hours === 200, 'Invalid hours saved');
  });
  await test('Failed allocation retains the saved target and displays the error', async () => {
    const a = createApp('professor', { roster: [{ ...request }] }); await a.api.openProfessor();
    a.state.rpcFailures.ojt_set_student_hours = 'You can only allocate hours for students enrolled with you.';
    await a.api.setHours('student-a', 500);
    const html = a.get('professor-students-content').innerHTML;
    assert(a.state.roster[0].required_hours === 200 && html.includes('value="200"') && html.includes('enrolled with you'), 'Failed allocation appeared successful');
  });
  await test('Reset ignores late allocation responses from a previous account', async () => {
    const a = createApp('professor', { roster: [{ ...request }] }); await a.api.openProfessor();
    let release; a.state.deferred = new Promise(resolve => { release = resolve; });
    const pending = a.api.setHours('student-a', 500); a.api.reset(); a.user.id = 'another-professor'; release(); await pending;
    assert(a.get('professor-students-content').innerHTML === '' && !a.state.notices.length, 'Old allocation response leaked');
  });
  return passed;
}
module.exports = runTests;
if (require.main === module) runTests().then(passed => console.log(`${passed.length} enrollment checks passed.`)).catch(error => { console.error(error); process.exitCode = 1; });
