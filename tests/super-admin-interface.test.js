const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../public/js/admin.js'), 'utf8');

function dashboard(adminRole) {
  const nodes = new Map(), calls = [];
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', open: false, hidden: false, disabled: false,
      innerHTML: '', textContent: '', returnValue: '',
      replaceChildren() { this.innerHTML = ''; }, reset() {}, focus() {},
      showModal() { this.open = true; }, close() { this.open = false; },
      querySelector() { return get(id + '-button'); } });
    return nodes.get(id);
  };
  const accounts = [
    { id: 'self', name: 'Me', email: 'me@example.edu', role: adminRole === 'super_admin' ? 'Super Admin' : 'Administrator' },
    { id: 'admin', name: 'Other Admin', email: 'admin@example.edu', role: 'Administrator' },
    { id: 'professor', name: 'Professor', email: 'professor@example.edu', role: 'Professor' },
    { id: 'student', name: 'Student', email: 'student@example.edu', role: 'Student', disabled: true },
    { id: 'student-active', name: 'Active Student', email: 'active@example.edu', role: 'Student', coordinator_id: 'professor', coordinator: 'Professor' },
    { id: 'professor-new', name: 'New Professor', email: 'new@example.edu', role: 'Professor' },
    { id: 'professor-disabled', name: 'Disabled Professor', email: 'disabled@example.edu', role: 'Professor', disabled: true },
  ];
  const client = { async rpc(name, args) {
    calls.push([name, args]);
    return { data: name === 'ojt_is_super_admin' ? adminRole === 'super_admin'
      : name === 'ojt_admin_overview' ? { accounts, events: [], awaiting: 0 }
      : name === 'ojt_document_requirements' ? [{ is_active: true, requirement_id: 'application' }] : null };
  } };
  const api = new Function('document', 'DocumentRequirements', 'currentUser', 'currentPage', 'supabase', 'showToast', `${source}\nreturn AdminDashboard;`)(
    { getElementById: get }, { escape: value => String(value ?? ''), setItems() {} },
    { id: 'self', accountType: 'admin', accountStatus: 'active', adminRole }, 'admin', client, () => {});
  const click = (id, action) => get('admin-directory').onclick({ target: { closest: () => ({ dataset: { account: id, action } }) } });
  return { api, get, calls, click };
}

async function runTests() {
  const passed = [];
  const test = async (name, fn) => { await fn(); passed.push(name); };
  await test('Regular admin sees disable/enable controls without permanent deletion or admin creation', async () => {
    const d = dashboard('admin'); await d.api.load();
    const html = d.get('admin-directory').innerHTML;
    assert(!html.includes('data-action="Delete user"'));
    assert(!html.includes('data-action="Remove admin access"'));
    assert(html.includes('data-account="professor" data-action="Disable user"'));
    assert(html.includes('data-account="student" data-action="Enable user"'));
    assert(d.get('admin-grant-form').hidden);
    d.click('student', 'Delete user');
    assert(!d.get('admin-delete-confirm').open);
  });
  await test('Super admin sees permanent deletion and administrator management', async () => {
    const d = dashboard('super_admin'); await d.api.load();
    assert(!d.get('admin-grant-form').hidden);
    const html = d.get('admin-directory').innerHTML;
    assert(html.includes('data-account="admin" data-action="Remove admin access"'));
    assert(html.includes('data-account="admin" data-action="Disable user"'));
    assert(html.includes('data-action="Delete user"'));
    assert(!html.includes('data-account="self" data-action="Disable user"'));
  });
  await test('Disabling a professor requires confirmation and cancellation makes no mutation', async () => {
    const d = dashboard('admin'); await d.api.load();
    d.click('professor', 'Disable user');
    assert(d.get('admin-confirm').open);
    assert(d.get('admin-confirm-detail').textContent.includes('preserved'));
    d.get('admin-confirm').returnValue = 'cancel';
    d.get('admin-confirm').onclose();
    assert(!d.calls.some(([name]) => name === 'ojt_admin_set_account_access'));
    d.click('professor', 'Disable user');
    d.get('admin-confirm').returnValue = 'apply';
    d.get('admin-confirm').onclose();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(d.calls.find(([name]) => name === 'ojt_admin_set_account_access')[1],
      { p_user: 'professor', p_action: 'Disable user' });
  });
  await test('Both admin roles can choose and confirm a new student coordinator', async () => {
    for (const role of ['admin', 'super_admin']) {
      const d = dashboard(role); await d.api.load();
      assert(d.get('admin-directory').innerHTML.includes('data-account="student-active" data-action="Change coordinator"'));
      d.click('student-active', 'Change coordinator');
      assert(d.get('admin-coordinator-confirm').open);
      const options = d.get('admin-coordinator-select').innerHTML;
      assert(options.includes('value="professor-new"'));
      assert(!options.includes('value="professor"') && !options.includes('value="professor-disabled"'));
      assert(d.get('admin-coordinator-apply').disabled);
      d.get('admin-coordinator-select').value = 'professor-new';
      d.get('admin-coordinator-select').onchange();
      assert(!d.get('admin-coordinator-apply').disabled);
      d.get('admin-coordinator-confirm').returnValue = 'apply';
      d.get('admin-coordinator-confirm').onclose();
      await new Promise(resolve => setImmediate(resolve));
      assert.deepEqual(d.calls.find(([name]) => name === 'ojt_admin_change_coordinator')[1], {
        p_student: 'student-active', p_coordinator: 'professor-new', p_expected_coordinator: 'professor',
      });
    }
  });
  await test('Canceling reassignment or selecting a disabled professor makes no change', async () => {
    const d = dashboard('admin'); await d.api.load();
    d.click('student-active', 'Change coordinator');
    d.get('admin-coordinator-select').value = 'professor-new';
    d.get('admin-coordinator-confirm').returnValue = 'cancel';
    d.get('admin-coordinator-confirm').onclose();
    d.click('student-active', 'Change coordinator');
    d.get('admin-coordinator-select').value = 'professor-disabled';
    d.get('admin-coordinator-confirm').returnValue = 'apply';
    d.get('admin-coordinator-confirm').onclose();
    assert(!d.calls.some(([name]) => name === 'ojt_admin_change_coordinator'));
  });
  return passed;
}
module.exports = runTests;
if (require.main === module) runTests().then(passed => console.log(`${passed.length} super-admin interface checks passed.`))
  .catch(error => { console.error(error); process.exitCode = 1; });
