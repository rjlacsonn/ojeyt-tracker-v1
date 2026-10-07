const fs = require('fs');
const model = require('../public/js/documents-model.js');
const source = fs.readFileSync(require('path').join(__dirname, '../public/js/documents.js'), 'utf8');

function createApp(options = {}) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { innerHTML: '', hidden: false, replaceChildren() { this.innerHTML = ''; } });
    return elements.get(id);
  };
  const user = { id: 'student-a' };
  const context = { is_coordinator: false, recipient_id: 'professor', recipient_name: 'Professor Test', ...options.context };
  const state = { rows: options.rows || [], calls: [], notices: [], registrationFails: false, uploadFails: false,
    deleteStale: false, queryError: null, deferQuery: null };
  const storage = {
    async upload(path, file, config) { state.calls.push(['upload', path, config]); return { error: state.uploadFails ? { message: 'Storage full' } : null }; },
    async remove(paths) { state.calls.push(['storage-remove', paths]); return { error: null }; },
    async download(path) { state.calls.push(['download', path]); return { data: {}, error: null }; },
  };
  const supabase = {
    storage: { from: () => storage },
    async rpc(name, args) {
      state.calls.push([name, args]);
      if (name === 'ojt_document_context') return { data: { ...context }, error: null };
      if (name === 'ojt_join_coordinator') { context.recipient_id = 'professor'; context.recipient_name = 'Professor Test'; return { error: null }; }
      if (name === 'ojt_register_document') {
        if (state.registrationFails) return { error: { message: 'Metadata unavailable' } };
        state.rows.push({ id: `file-${state.rows.length}`, user_id: user.id, requirement_id: args.p_requirement,
          file_name: args.p_name, file_path: args.p_path, file_size: 100, status: 'draft' });
        return { data: {}, error: null };
      }
      if (name === 'ojt_submit_documents') {
        state.rows.filter(row => args.p_ids.includes(row.id)).forEach(row => { row.status = 'submitted'; row.coordinator_id = 'professor'; });
        return { data: args.p_ids.length, error: null };
      }
      if (name === 'ojt_review_document') {
        const row = state.rows.find(row => row.id === args.p_id); row.status = args.p_decision; row.feedback = args.p_feedback;
        return { error: null };
      }
      throw new Error(`Unexpected RPC: ${name}`);
    },
    from() {
      let deleting = false; const predicates = [];
      const query = {
        select() { return this; }, delete() { deleting = true; return this; },
        eq(key, value) { predicates.push(row => row[key] === value); return this; },
        neq(key, value) { predicates.push(row => row[key] !== value); return this; },
        in(key, values) { predicates.push(row => values.includes(row[key])); return this; },
        order() { return this; },
        then(resolve, reject) {
          const result = () => {
            let rows = state.rows.filter(row => predicates.every(fn => fn(row)));
            if (deleting) {
              state.calls.push(['record-delete']);
              if (state.deleteStale) rows = [];
              else state.rows = state.rows.filter(row => !rows.includes(row));
            }
            return { data: rows.map(row => ({ ...row })), error: state.queryError };
          };
          return (state.deferQuery ? state.deferQuery.then(result) : Promise.resolve(result())).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const api = new Function('DocumentRequirements', 'supabase', 'document', 'currentUser', 'crypto', 'showToast', 'confirm', 'console', `
    let currentPage = 'documents';
    ${source}
    return { ...Documents, setPage(page) { currentPage = page; } };
  `)(model, supabase, { getElementById: element, addEventListener() {} }, user,
    { randomUUID: () => '00000000-0000-4000-8000-000000000001' }, msg => state.notices.push(msg), () => true, { error() {} });
  return { api, state, element, user };
}

async function runTests() {
  const passed = [];
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const test = async (name, fn) => { await fn(); passed.push(name); };
  const file = { name: 'form.pdf', size: 100, type: 'application/pdf' };
  const row = (status = 'draft') => ({ id: 'file-a', user_id: 'student-a', requirement_id: 'application',
    file_name: '<script>bad</script>.pdf', file_path: 'student-a/application/file.pdf', file_size: 100, status,
    coordinator_id: 'professor', student_name: 'Student', student_email: 'student@example.edu' });
  const ready = async options => { const a = createApp(options); await a.api.initializeAccount(); await a.api.open(); return a; };

  await test('Student role hides Review navigation and escapes filenames', async () => {
    const a = await ready({ rows: [row()] });
    assert(a.element('review-nav-btn').hidden, 'Review visible to student');
    const html = a.element('documents-content').innerHTML;
    assert(html.includes('OJT Application Form') && html.includes('Non-Disclosure'), 'Requirements not rendered');
    assert(!html.includes('<script>bad'), 'Filename inserted as HTML');
  });
  await test('Invalid uploads never reach storage', async () => {
    const a = await ready(); await a.api.upload('application', [{ ...file, size: 0 }]);
    assert(!a.state.calls.some(c => c[0] === 'upload'), 'Invalid upload attempted');
  });
  await test('Upload registers a private draft without overwriting', async () => {
    const a = await ready(); await a.api.upload('application', [file]);
    const call = a.state.calls.find(c => c[0] === 'upload');
    assert(call[1].startsWith('student-a/application/') && call[2].upsert === false, 'Unsafe upload path or overwrite');
    assert(a.state.rows[0].status === 'draft' && a.element('documents-content').innerHTML.includes('Ready to submit'), 'Upload falsely submitted');
  });
  await test('Metadata failure cleans up uploaded object and reports error', async () => {
    const a = await ready(); a.state.registrationFails = true; await a.api.upload('application', [file]);
    assert(a.state.calls.some(c => c[0] === 'storage-remove') && !a.state.rows.length, 'Orphan not cleaned');
    assert(a.element('documents-content').innerHTML.includes('Metadata unavailable'), 'Failure hidden');
  });
  await test('Storage failure never registers a document', async () => {
    const a = await ready(); a.state.uploadFails = true; await a.api.upload('application', [file]);
    assert(!a.state.calls.some(c => c[0] === 'ojt_register_document'), 'Failed upload registered');
  });
  await test('Submission requires connected coordinator', async () => {
    const a = await ready({ context: { recipient_id: null }, rows: [row()] }); await a.api.submit();
    assert(!a.state.calls.some(c => c[0] === 'ojt_submit_documents'), 'Unassigned submission sent');
  });
  await test('Coordinator connection normalizes code', async () => {
    const a = await ready({ context: { recipient_id: null } }); await a.api.connect(' abcdef123456 ');
    assert(a.state.calls.some(c => c[0] === 'ojt_join_coordinator' && c[1].p_code === 'ABCDEF123456'), 'Code not normalized');
  });
  await test('Submit sends only editable records', async () => {
    const a = await ready({ rows: [row(), { ...row('approved'), id: 'approved' }] }); await a.api.submit();
    const ids = a.state.calls.find(c => c[0] === 'ojt_submit_documents')[1].p_ids;
    assert(ids.length === 1 && ids[0] === 'file-a', 'Approved file resubmitted');
  });
  await test('Submitted files cannot be removed', async () => {
    const a = await ready({ rows: [row('submitted')] }); await a.api.remove('file-a');
    assert(!a.state.calls.some(c => c[0] === 'record-delete' || c[0] === 'storage-remove'), 'Submitted file deleted');
  });
  await test('Draft deletion removes record before object', async () => {
    const a = await ready({ rows: [row()] }); await a.api.remove('file-a');
    const names = a.state.calls.map(c => c[0]);
    assert(names.indexOf('record-delete') < names.indexOf('storage-remove') && a.state.rows.length === 0, 'Wrong deletion order');
  });
  await test('Stale deletion never removes a now-locked object', async () => {
    const a = await ready({ rows: [row()] }); a.state.deleteStale = true; await a.api.remove('file-a');
    assert(!a.state.calls.some(c => c[0] === 'storage-remove'), 'Locked object removed');
  });
  await test('Student cannot open coordinator review inbox', async () => {
    const a = await ready(); a.api.setPage('document-review'); await a.api.openReview();
    assert(a.element('document-review-content').innerHTML.includes('Coordinator access is required'), 'Student review not denied');
  });
  await test('Coordinator reviews only submitted files and needs revision feedback', async () => {
    const a = await ready({ context: { is_coordinator: true, coordinator_name: 'Professor', join_code: 'ABCDEF123456' }, rows: [row('submitted')] });
    a.user.id = 'professor'; await a.api.initializeAccount(); a.api.setPage('document-review'); await a.api.openReview();
    assert(!a.element('review-nav-btn').hidden && a.element('doc-review-list').innerHTML.includes('Return for revision'), 'Review missing');
    await a.api.review('file-a', 'returned', '   ');
    assert(!a.state.calls.some(c => c[0] === 'ojt_review_document'), 'Empty revision feedback accepted');
    await a.api.review('file-a', 'returned', 'Please add your signature.');
    assert(a.state.rows[0].status === 'returned' && a.state.rows[0].feedback.includes('signature'), 'Revision feedback lost');
  });
  await test('Reset ignores a late request from another account', async () => {
    const a = await ready({ rows: [row()] });
    let release; a.state.deferQuery = new Promise(resolve => { release = resolve; });
    const pending = a.api.open(); await Promise.resolve(); await Promise.resolve();
    a.api.reset(); a.user.id = 'student-b'; release(); await pending;
    assert(a.element('documents-content').innerHTML === '', 'Previous account rendered after logout');
  });
  await test('Switching to Review during a load fetches the correct inbox', async () => {
    const a = await ready({ context: { is_coordinator: true }, rows: [row('submitted')] });
    a.user.id = 'professor'; await a.api.initializeAccount();
    let release; a.state.deferQuery = new Promise(resolve => { release = resolve; });
    const pending = a.api.open(); await Promise.resolve(); await Promise.resolve();
    a.api.setPage('document-review'); await a.api.openReview(); release(); await pending;
    assert(a.element('doc-review-list').innerHTML.includes('Student'), 'Review inbox left stale');
  });
  await test('Loading errors stay visible instead of claiming a successful fetch', async () => {
    const a = await ready(); a.state.queryError = { message: 'Connection lost' }; await a.api.open();
    assert(a.element('documents-content').innerHTML.includes('Connection lost'), 'Loading error hidden');
  });
  return passed;
}
module.exports = runTests;
if (require.main === module) runTests().then(passed => console.log(`${passed.length} document workflow checks passed.`)).catch(error => { console.error(error); process.exitCode = 1; });
