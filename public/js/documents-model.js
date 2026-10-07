/* Requirement IDs follow the numbering in the supplied school checklist. */
const DocumentRequirements = (() => {
  const items = [
    { id: 'application', number: 4, name: 'OJT Application Form' },
    { id: 'deployment-interview', number: 5, name: 'Pre-OJT Deployment Interview' },
    { id: 'information-monitoring', number: 6, name: 'OJT Information and Monitoring Form' },
    { id: 'feedback-paper', number: 7, name: 'OJT Feedback Paper Pattern' },
    { id: 'professional-development', number: 8, name: 'OJT Professional Development Activities' },
    { id: 'work-pictures', number: 9, name: 'OJT Pictures at Work' },
    { id: 'waiver', number: 10, name: 'OJT Waiver' },
    { id: 'certification', number: 11, name: 'OJT Certification' },
    { id: 'undertaking-consent', number: 12, name: 'OJT Deed of Undertaking / Informed Consent' },
    { id: 'confidentiality', number: 13, name: 'Non-Disclosure and Confidentiality Agreement' },
  ];
  const types = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  };
  const maxBytes = 10 * 1024 * 1024;
  const labels = { draft: 'Ready to submit', submitted: 'Awaiting review', approved: 'Approved', returned: 'Needs revision' };
  function escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }
  function validate(file) {
    if (!file || !file.name) return 'Choose a file to upload.';
    const extension = file.name.split('.').pop().toLowerCase();
    if (!types[extension]) return 'Use a PDF, Word, Excel, JPG, or PNG file.';
    if (!Number.isFinite(file.size) || file.size <= 0) return 'Empty files cannot be uploaded.';
    if (file.size > maxBytes) return 'Each file must be 10 MB or smaller.';
    if (file.name.length > 240) return 'Shorten the filename to 240 characters or fewer.';
    if (file.type && file.type !== 'application/octet-stream' && file.type !== types[extension]) {
      return 'The file type does not match its extension. Export the document again and retry.';
    }
    return null;
  }
  function contentType(file) { return types[file.name.split('.').pop().toLowerCase()]; }
  function sizeLabel(bytes) { return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }
  function summary(rows) {
    const byRequirement = items.map(item => {
      const files = rows.filter(row => row.requirement_id === item.id);
      // Revisions and unsubmitted additions must stay visible even if another file was approved.
      const status = !files.length ? 'missing' : files.some(f => f.status === 'returned') ? 'returned' :
        files.some(f => f.status === 'draft') ? 'draft' : files.some(f => f.status === 'submitted') ? 'submitted' : 'approved';
      return { ...item, files, status };
    });
    return { items: byRequirement, uploaded: byRequirement.filter(item => item.files.length).length,
      approved: byRequirement.filter(item => item.status === 'approved').length,
      pending: rows.filter(row => row.status === 'submitted').length,
      ready: rows.filter(row => row.status === 'draft' || row.status === 'returned').length };
  }
  function reviewSummary(students, rows) {
    const groups = new Map();
    for (const student of students) {
      if (!student.student_id) continue;
      groups.set(student.student_id, { id: student.student_id, name: student.full_name || 'Student',
        email: student.email || '', enrolled: true, files: [] });
    }
    for (const row of rows) {
      if (!row.user_id || !['submitted', 'approved', 'returned'].includes(row.status) ||
          !items.some(item => item.id === row.requirement_id)) continue;
      if (!groups.has(row.user_id)) groups.set(row.user_id, { id: row.user_id,
        name: row.student_name || 'Student', email: row.student_email || '', enrolled: false, files: [] });
      groups.get(row.user_id).files.push(row);
    }
    return [...groups.values()].map(student => {
      const progress = summary(student.files);
      return { ...student, items: progress.items, submitted: progress.uploaded, approved: progress.approved,
        awaiting: progress.items.filter(item => item.status === 'submitted').length,
        returned: progress.items.filter(item => item.status === 'returned').length,
        missing: progress.items.filter(item => item.status === 'missing').length,
        percent: Math.round(progress.approved / items.length * 100) };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }
  return { items, types, maxBytes, labels, escape, validate, contentType, sizeLabel, summary, reviewSummary };
})();
if (typeof module !== 'undefined') module.exports = DocumentRequirements;
