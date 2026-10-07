const fs = require('fs');
const path = require('path');
const access = require('../public/js/account-access.js');
const authSource = fs.readFileSync(path.join(__dirname, '../public/js/auth.js'), 'utf8');

async function runTests() {
  const passed = [];
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const test = async (name, fn) => { await fn(); passed.push(name); };
  const student = { accountType: 'student', accountStatus: 'active' };
  const pending = { accountType: 'student', accountStatus: 'pending' };
  const professor = { accountType: 'professor', accountStatus: 'active' };
  function makeAuth(session = { access_token: 'test' }) {
    const calls = [];
    const client = {
      auth: {
        getSession: async () => ({ data: { session: null } }),
        onAuthStateChange() {},
        async signUp(args) { calls.push(['signup', args]); return { data: { user: { id: 'new-user' }, session }, error: null }; },
      },
      from: () => ({ async upsert(data) { calls.push(['profile', data]); return { error: null }; } }),
    };
    return { auth: new Function('supabase', `${authSource}\nreturn auth;`)(client), calls };
  }
  await test('Student lands on dashboard and has no review access', async () => {
    assert(access.home(student) === 'dashboard' && access.canVisit(student, 'documents') && !access.canVisit(student, 'document-review'), 'Wrong student permissions');
  });
  await test('Pending student lands on approval page without tracker or review access', async () => {
    assert(access.home(pending) === 'student-home' && access.canVisit(pending, 'settings'), 'Pending route missing');
    for (const page of ['document-review', 'dashboard', 'documents', 'badges', 'history']) assert(!access.canVisit(pending, page), `Pending student can visit ${page}`);
  });
  await test('Professor lands on Students without student-only pages', async () => {
    assert(access.home(professor) === 'student-approvals' && access.canVisit(professor, 'document-review') && access.canVisit(professor, 'student-approvals'), 'Wrong professor home');
    for (const page of ['dashboard', 'documents', 'badges', 'history']) assert(!access.canVisit(professor, page), `Professor can visit ${page}`);
  });
  await test('Unconfirmed account fails closed', async () => {
    assert(access.home({}) === 'account-unavailable' && !access.canVisit({}, 'document-review') && !access.canVisit({}, 'dashboard'), 'Unknown account granted access');
  });
  await test('Account access comes from database context', async () => {
    const role = await access.load({ rpc: async name => ({ data: { account_type: 'student', status: 'pending', recipient_id: 'professor', recipient_name: 'Maam Geece' } }) });
    assert(role.accountType === 'student' && role.accountStatus === 'pending' && role.recipientName === 'Maam Geece', 'Context not used');
  });
  await test('Invalid context and failed RPC do not default to a student role', async () => {
    for (const result of [{ data: { account_type: 'admin', status: 'active' } }, { data: { account_type: 'student', status: 'unknown' } }, { error: { message: 'Unavailable' } }]) {
      let failed = false; try { await access.load({ rpc: async () => result }); } catch { failed = true; }
      assert(failed, 'Invalid context trusted');
    }
  });
  await test('Old professor approval policy requires the new migration', async () => {
    let error;
    try { await access.load({ rpc: async () => ({ data: { account_type: 'professor', status: 'pending' } }) }); } catch (caught) { error = caught; }
    assert(error?.code === 'OJT_APPROVAL_SETUP_REQUIRED', 'Outdated professor approval silently accepted');
  });
  await test('Missing account lookup explains setup without requesting duplicate signup', async () => {
    const issue = access.describeError({ code: 'PGRST202' });
    assert(issue.title === 'Account setup is incomplete' && issue.message.includes('do not need to register again'), 'Missing setup diagnosis unclear');
  });
  await test('Permission and transient failures have distinct recovery guidance', async () => {
    assert(access.describeError({ code: '42501' }).message.includes('permissions'), 'Permission error misclassified');
    assert(access.describeError({ message: 'Failed to fetch' }).title === 'Account access unavailable', 'Transient failure misclassified as missing setup');
  });
  await test('Student registration cannot allocate its own hour target', async () => {
    const a = makeAuth(); const result = await a.auth.signup('Student', 'student@example.edu', 'password', 'password', 400);
    const meta = a.calls[0][1].options.data;
    assert(result.success && meta.account_type === 'student' && !('required_hours' in meta) && !meta.institution, 'Student allocated its own hours');
    assert(!a.calls.some(call => call[0] === 'profile'), 'Signup overwrote database-managed profile target');
  });
  await test('Professor registration stores school details and explains immediate access', async () => {
    const a = makeAuth(); const result = await a.auth.signup('Professor', 'professor@example.edu', 'password', 'password', undefined,
      { accountType: 'professor', institution: ' Test University ', department: ' Computing ' });
    const meta = a.calls[0][1].options.data;
    assert(result.success && result.message.includes('approve students'), 'Professor activation message incorrect');
    assert(meta.account_type === 'professor' && meta.institution === 'Test University' && meta.department === 'Computing' && !meta.is_coordinator, 'Incorrect professor payload');
  });
  await test('Professor school is required before contacting signup service', async () => {
    const a = makeAuth(); const result = await a.auth.signup('Professor', 'p@example.edu', 'password', 'password', 200, { accountType: 'professor' });
    assert(!result.success && !a.calls.length, 'Missing institution accepted');
  });
  await test('Signup ignores legacy hour arguments and works without an hour input', async () => {
    for (const hours of [undefined, 0, -1, 1.5, 10001, NaN]) {
      const a = makeAuth(); const result = await a.auth.signup('Student', 's@example.edu', 'password', 'password', hours);
      assert(result.success && !('required_hours' in a.calls[0][1].options.data), `Legacy hours used: ${hours}`);
    }
  });
  await test('Email confirmation does not create an authenticated app session', async () => {
    const a = makeAuth(null); const result = await a.auth.signup('Professor', 'p@example.edu', 'password', 'password', 200,
      { accountType: 'professor', institution: 'Test University' });
    assert(result.success && result.needsEmailConfirmation && !a.auth.isAuthenticated && !a.auth.session, 'Confirmation bypassed');
    assert(!a.calls.some(call => call[0] === 'profile'), 'Unauthenticated profile update attempted');
  });
  await test('Account type tampering and blank names rejected', async () => {
    const a = makeAuth();
    assert(!(await a.auth.signup('Professor', 'p@example.edu', 'password', 'password', 200, { accountType: 'admin' })).success, 'Admin type accepted');
    assert(!(await a.auth.signup('  ', 'p@example.edu', 'password', 'password', 200)).success && !a.calls.length, 'Blank name accepted');
  });
  return passed;
}
module.exports = runTests;
if (require.main === module) runTests().then(passed => console.log(`${passed.length} account registration checks passed.`)).catch(error => { console.error(error); process.exitCode = 1; });
