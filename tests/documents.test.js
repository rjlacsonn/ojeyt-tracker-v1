const model = require('../public/js/documents-model.js');
function runTests() {
  const passed = [];
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const test = (name, fn) => { fn(); passed.push(name); };
  const file = (name = 'form.pdf', size = 100, type = 'application/pdf') => ({ name, size, type });
  test('Ten requirements preserve screenshot numbering', () => {
    assert(model.items.length === 10 && model.items[0].number === 4 && model.items[9].number === 13, 'Incorrect checklist');
    assert(new Set(model.items.map(item => item.id)).size === 10, 'Duplicate requirement IDs');
  });
  test('All configured file formats accepted', () => {
    for (const [ext, type] of Object.entries(model.types)) assert(!model.validate(file(`form.${ext}`, 100, type)), `Rejected ${ext}`);
  });
  test('Size boundary enforced', () => {
    assert(!model.validate(file('form.pdf', model.maxBytes)), 'Exact limit rejected');
    assert(model.validate(file('form.pdf', model.maxBytes + 1)), 'Oversize accepted');
    assert(model.validate(file('form.pdf', 0)), 'Empty file accepted');
  });
  test('Unsupported and mismatched file types rejected', () => {
    assert(model.validate(file('unsafe.html')), 'HTML accepted');
    assert(model.validate(file('image.pdf', 100, 'image/png')), 'Mismatched type accepted');
    assert(model.validate(file('form.pdf.exe')), 'Executable accepted');
  });
  test('Case insensitive extension and unknown browser MIME handled', () => {
    assert(!model.validate(file('FORM.PDF', 100, '')), 'Uppercase extension rejected');
    assert(!model.validate(file('form.doc', 100, 'application/octet-stream')), 'Generic MIME rejected');
  });
  test('Filename and invalid size validation', () => {
    assert(model.validate(file('x'.repeat(241) + '.pdf')), 'Long filename accepted');
    assert(model.validate(file('form.pdf', NaN)), 'NaN size accepted');
    assert(model.validate(file('form.pdf', -1)), 'Negative size accepted');
  });
  test('File names and feedback are escaped', () => {
    const escaped = model.escape('<img src=x onerror="alert(1)"> & \'');
    assert(!escaped.includes('<') && !escaped.includes('"') && escaped.includes('&amp;'), 'Unsafe HTML');
  });
  test('Empty checklist has no false completed requirements', () => {
    const s = model.summary([]);
    assert(s.uploaded === 0 && s.approved === 0 && s.ready === 0 && s.items.every(i => i.status === 'missing'), 'Incorrect empty summary');
  });
  test('Partial approvals do not complete a requirement', () => {
    const s = model.summary([{ requirement_id: 'application', status: 'approved' }, { requirement_id: 'application', status: 'submitted' }]);
    assert(s.approved === 0 && s.pending === 1 && s.items[0].status === 'submitted', 'Partial approval hidden');
  });
  test('Draft additions and returned files remain visible', () => {
    const s = model.summary([{ requirement_id: 'application', status: 'approved' }, { requirement_id: 'application', status: 'draft' },
      { requirement_id: 'waiver', status: 'returned' }]);
    assert(s.ready === 2 && s.approved === 0 && s.items[0].status === 'draft' && s.items[6].status === 'returned', 'Revisions hidden');
  });
  test('All approved attachments complete a requirement', () => {
    const s = model.summary([{ requirement_id: 'work-pictures', status: 'approved' }, { requirement_id: 'work-pictures', status: 'approved' }]);
    assert(s.approved === 1 && s.uploaded === 1, 'Attachment count confused with requirement count');
  });
  test('Review progress includes enrolled students with no submissions', () => {
    const [s] = model.reviewSummary([{ student_id: 'student-a', full_name: 'Student', email: 's@example.edu' }], []);
    assert(s.missing === 10 && s.approved === 0 && s.submitted === 0 && s.percent === 0, 'False progress for empty student');
  });
  test('Review progress counts requirements rather than attachments', () => {
    const rows = [
      { user_id: 'a', requirement_id: 'application', status: 'approved' },
      { user_id: 'a', requirement_id: 'application', status: 'approved' },
      { user_id: 'a', requirement_id: 'waiver', status: 'submitted' },
      { user_id: 'a', requirement_id: 'certification', status: 'returned' },
    ];
    const [s] = model.reviewSummary([], rows);
    assert(s.approved === 1 && s.percent === 10 && s.submitted === 3 && s.awaiting === 1 && s.returned === 1 && s.missing === 7, 'Wrong requirement progress');
  });
  test('Partially approved and returned attachments keep requirements incomplete', () => {
    const [s] = model.reviewSummary([], [
      { user_id: 'a', requirement_id: 'application', status: 'approved' },
      { user_id: 'a', requirement_id: 'application', status: 'submitted' },
      { user_id: 'a', requirement_id: 'waiver', status: 'submitted' },
      { user_id: 'a', requirement_id: 'waiver', status: 'returned' },
    ]);
    assert(s.approved === 0 && s.awaiting === 1 && s.returned === 1 && s.missing === 8, 'Incomplete requirements counted approved');
  });
  test('Review progress excludes private drafts and unknown requirements', () => {
    const [s] = model.reviewSummary([{ student_id: 'a' }], [
      { user_id: 'a', requirement_id: 'application', status: 'draft' },
      { user_id: 'a', requirement_id: 'unknown', status: 'approved' },
    ]);
    assert(s.missing === 10 && s.submitted === 0 && !s.files.length, 'Private or unknown files entered progress');
  });
  test('Student identities isolate progress even with duplicate names', () => {
    const students = model.reviewSummary([{ student_id: 'a', full_name: 'Same name' }, { student_id: 'b', full_name: 'Same name' }],
      [{ user_id: 'a', requirement_id: 'waiver', status: 'approved' }]);
    assert(students.find(s => s.id === 'a').percent === 10 && students.find(s => s.id === 'b').percent === 0, 'Student progress mixed together');
  });
  test('Historical submissions stay visible and complete checklist reaches 100 percent', () => {
    const [s] = model.reviewSummary([], model.items.map(item => ({ user_id: 'former-student', requirement_id: item.id, status: 'approved' })));
    assert(!s.enrolled && s.percent === 100 && s.approved === 10 && s.missing === 0, 'Historical or completed progress lost');
  });
  return passed;
}
module.exports = runTests;
if (require.main === module) console.log(`${runTests().length} document model checks passed.`);
