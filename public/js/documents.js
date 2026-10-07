/* Student drafts and coordinator reviews use the same private Supabase files. */
const Documents = (() => {
  const bucket = 'ojt-documents';
  const model = DocumentRequirements;
  const esc = model.escape;
  let rows = [], reviews = [], context = null, accountId = null;
  let busy = false, errorMessage = '', generation = 0, requestId = 0;
  let reviewFilter = 'submitted', reviewSearch = '';
  let desiredReview = false;
  let reviewStudents = [], reviewStudentId = '', reviewProgressLoaded = false, reviewRosterError = '';
  const reviewFeedback = new Map();

  function reset() {
    generation++; requestId++;
    rows = []; reviews = []; context = null; accountId = null;
    busy = false; errorMessage = ''; reviewFilter = 'submitted'; reviewSearch = '';
    desiredReview = false;
    reviewStudents = []; reviewStudentId = ''; reviewProgressLoaded = false; reviewRosterError = '';
    reviewFeedback.clear();
    const reviewNav = document.getElementById('review-nav-btn');
    if (reviewNav) reviewNav.hidden = true;
    for (const id of ['documents-content', 'document-review-content']) {
      const el = document.getElementById(id);
      if (el) el.replaceChildren();
    }
  }
  function sameSession(version, userId) { return version === generation && currentUser?.id === userId; }
  function friendlyError(error) {
    console.error('Documents:', error);
    if (['PGRST202', '42P01', 'PGRST205'].includes(error?.code)) {
      return 'Document submissions are not available yet. Please contact your OJT coordinator.';
    }
    return error?.message || 'Could not complete this action. Please try again.';
  }
  async function identify() {
    if (!currentUser) return null;
    const userId = currentUser.id, version = generation;
    const { data, error } = await supabase.rpc('ojt_document_context');
    if (!sameSession(version, userId)) return null;
    if (error) throw error;
    context = data;
    accountId = userId;
    const nav = document.getElementById('review-nav-btn');
    if (nav) nav.hidden = !context?.is_coordinator;
    return context;
  }
  async function initializeAccount() {
    reset();
    try { await identify(); } catch (error) { console.error('Documents setup:', error); }
  }
  function statusTag(status) {
    const label = model.labels[status] || 'Not uploaded';
    const safeStatus = Object.hasOwn(model.labels, status) ? status : 'missing';
    return `<span class="doc-status doc-status-${safeStatus}">${label}</span>`;
  }
  function timestamp(value) {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  }
  function feedback(row) {
    return row.feedback ? `<p class="doc-feedback"><strong>Coordinator feedback:</strong> ${esc(row.feedback)}</p>` : '';
  }
  function fileRow(row) {
    const editable = row.status === 'draft' || row.status === 'returned';
    return `<li class="doc-file">
      <div class="doc-file-description"><strong>${esc(row.file_name)}</strong>
        <span>${esc(model.sizeLabel(Number(row.file_size)))} · Uploaded ${esc(timestamp(row.created_at))}</span>
        ${row.submitted_at ? `<span>Submitted ${esc(timestamp(row.submitted_at))}</span>` : ''}
        ${feedback(row)}</div>
      <div class="doc-file-actions">${statusTag(row.status)}
        <button type="button" class="doc-button" data-doc-action="download" data-id="${esc(row.id)}" ${busy ? 'disabled' : ''}>Download</button>
        ${editable ? `<button type="button" class="doc-button doc-remove" data-doc-action="remove" data-id="${esc(row.id)}" ${busy ? 'disabled' : ''}>Remove</button>` : ''}
      </div>
    </li>`;
  }
  function renderStudent() {
    const container = document.getElementById('documents-content');
    if (!container) return;
    const summary = model.summary(rows);
    container.innerHTML = `
      <div class="doc-notice" role="status" aria-live="polite">${busy ? 'Working on your documents…' : ''}</div>
      ${errorMessage ? `<p class="doc-error" role="alert">${esc(errorMessage)}</p>` : ''}
      <div class="doc-summary">
        <div><strong>${summary.uploaded} / ${model.items.length}</strong><span>Requirements uploaded</span></div>
        <div><strong>${summary.pending}</strong><span>Files awaiting review</span></div>
        <div><strong>${summary.approved} / ${model.items.length}</strong><span>Requirements approved</span></div>
      </div>
      <article class="panel doc-recipient">
        <div><h2>Your OJT coordinator</h2><p>${context?.recipient_name ? `Connected to <strong>${esc(context.recipient_name)}</strong>.` : 'Enter the code shared by your professor or coordinator before submitting.'}</p></div>
        <form class="doc-connect-form">
          <label for="coordinator-code">Coordinator code</label>
          <div class="doc-connect-controls"><input id="coordinator-code" name="code" type="text" minlength="8" maxlength="32" autocomplete="off" autocapitalize="characters" placeholder="Enter coordinator code" required ${busy ? 'disabled' : ''} />
          <button class="doc-button doc-button-primary" type="submit" ${busy || !context ? 'disabled' : ''}>${context?.recipient_id ? 'Change coordinator' : 'Connect'}</button></div>
        </form>
      </article>
      <div class="doc-toolbar"><p>PDF, Word, Excel, JPG or PNG · Up to 10 MB per file. Multiple attachments are welcome.</p>
        <button type="button" class="doc-button doc-button-primary" data-doc-action="submit-all" ${busy || !summary.ready || !context?.recipient_id ? 'disabled' : ''}>Submit ready files (${summary.ready})</button>
      </div>
      <p class="doc-help">Uploads are private drafts until you submit them. Your coordinator can approve files or return them with feedback. To replace a returned file, remove it and upload the revision.</p>
      <div class="doc-requirements">${summary.items.map(item => `
        <article class="panel doc-requirement">
          <div class="doc-requirement-heading"><span class="doc-number">${item.number}</span><h2>${esc(item.name)}</h2>${statusTag(item.status)}</div>
          ${item.files.length ? `<ul class="doc-files">${item.files.map(fileRow).join('')}</ul>` : '<p class="doc-empty">No files uploaded yet.</p>'}
          <div class="doc-requirement-actions">
            <label class="doc-upload-label ${busy || !context ? 'is-disabled' : ''}"><span>＋ ${item.files.length ? 'Add files' : 'Upload files'}</span>
              <input type="file" class="doc-file-input" data-requirement="${item.id}" accept="${Object.keys(model.types).map(ext => `.${ext}`).join(',')}" multiple aria-label="Upload ${esc(item.name)}" ${busy || !context ? 'disabled' : ''} />
            </label>
            <button type="button" class="doc-button" data-doc-action="submit-requirement" data-requirement="${item.id}" ${busy || !context?.recipient_id || !item.files.some(f => f.status === 'draft' || f.status === 'returned') ? 'disabled' : ''}>Submit for review</button>
          </div>
        </article>`).join('')}</div>`;
  }
  function renderReview() {
    const container = document.getElementById('document-review-content');
    if (!container) return;
    if (!context?.is_coordinator) {
      container.innerHTML = `<p class="doc-error" role="alert">${esc(errorMessage || 'This page is available to registered OJT coordinators.')}</p>`;
      return;
    }
    container.innerHTML = `
      <div class="doc-notice" role="status" aria-live="polite">${busy ? 'Working on submissions…' : ''}</div>
      ${errorMessage ? `<p class="doc-error" role="alert">${esc(errorMessage)}</p>` : ''}
      <article class="panel doc-recipient"><div><h2>${esc(context.coordinator_name)}</h2><p>Share this code with your students so they can submit documents to you.</p></div>
        <div class="doc-code"><span>Your coordinator code</span><strong>${esc(context.join_code)}</strong></div></article>
      <div class="doc-review-filters">
        <label>Student<select id="doc-review-student"><option value="">All students</option>${model.reviewSummary(reviewStudents, reviews).map(student => `<option value="${esc(student.id)}" ${reviewStudentId === student.id ? 'selected' : ''}>${esc(student.name)}${student.email ? ` (${esc(student.email)})` : ''}</option>`).join('')}</select></label>
        <label>Status<select id="doc-review-filter">${[['submitted', 'Awaiting review'], ['returned', 'Needs revision'], ['approved', 'Approved'], ['all', 'All submissions']].map(([value, label]) => `<option value="${value}" ${reviewFilter === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
        <label>Find student<input id="doc-review-search" type="search" value="${esc(reviewSearch)}" placeholder="Name or email" /></label>
      </div>
      <h2 class="doc-section-title">Student document progress</h2>
      <p class="doc-help">Progress counts approved requirements from the ${model.items.length}-requirement checklist. Counts below are requirements, not individual attachments. Private drafts are not visible until submitted.</p>
      <div id="doc-review-progress"></div>
      <h2 class="doc-section-title">Files to review</h2>
      <p class="doc-help">The status filter applies to the files below. Student progress includes all submission statuses.</p>
      <div id="doc-review-list"></div>`;
    renderReviewList();
  }
  function renderReviewList() {
    const list = document.getElementById('doc-review-list');
    if (!list) return;
    const search = reviewSearch.toLowerCase().trim();
    const students = model.reviewSummary(reviewStudents, reviews);
    const matchesStudent = student => (!reviewStudentId || student.id === reviewStudentId) &&
      `${student.name} ${student.email}`.toLowerCase().includes(search);
    const matchingIds = new Set(students.filter(matchesStudent).map(student => student.id));
    renderReviewProgress(students.filter(matchesStudent));
    const visible = reviews.filter(row => (reviewFilter === 'all' || row.status === reviewFilter) &&
      matchingIds.has(row.user_id));
    list.innerHTML = visible.length ? visible.map(row => {
      const requirement = model.items.find(item => item.id === row.requirement_id);
      return `<article class="panel doc-review-card">
        <div class="doc-review-heading"><div><h2>${esc(row.student_name || 'Student')}</h2><p>${esc(row.student_email)}</p></div>${statusTag(row.status)}</div>
        <h3>${esc(requirement?.name || row.requirement_id)}</h3>
        <p class="doc-review-filename">${esc(row.file_name)} · ${esc(model.sizeLabel(Number(row.file_size)))}</p>
        <p class="doc-help">Submitted ${esc(timestamp(row.submitted_at))}</p>
        <button type="button" class="doc-button" data-doc-action="download-review" data-id="${esc(row.id)}" ${busy ? 'disabled' : ''}>Download file</button>
        ${feedback(row)}
        ${row.status === 'submitted' ? `<form class="doc-review-form" data-id="${esc(row.id)}">
          <label for="feedback-${esc(row.id)}">Feedback <span>(required when returning a file)</span></label>
          <textarea id="feedback-${esc(row.id)}" name="feedback" rows="2" maxlength="4000" placeholder="Explain any changes the student needs to make." ${busy ? 'disabled' : ''}>${esc(reviewFeedback.get(row.id) || '')}</textarea>
          <div class="doc-review-actions"><button type="submit" value="approved" class="doc-button doc-button-primary" ${busy ? 'disabled' : ''}>Approve</button>
          <button type="submit" value="returned" class="doc-button" ${busy ? 'disabled' : ''}>Return for revision</button></div>
        </form>` : `<p class="doc-help">Reviewed ${esc(timestamp(row.reviewed_at))}</p>`}
      </article>`;
    }).join('') : '<p class="doc-empty panel">No submissions match this view.</p>';
  }
  function renderReviewProgress(students) {
    const container = document.getElementById('doc-review-progress');
    if (!container) return;
    if (!reviewProgressLoaded) {
      container.innerHTML = `<p class="doc-notice">${busy ? 'Loading document progress…' : 'Document progress is unavailable. Select Refresh to try again.'}</p>`;
      return;
    }
    container.innerHTML = `${reviewRosterError ? `<p class="doc-error" role="alert">${esc(reviewRosterError)}</p>` : ''}` +
      (students.length ? students.map(student => `<article class="panel doc-student-progress">
        <div class="doc-review-heading"><div><h3>${esc(student.name)}</h3><p>${esc(student.email)}</p></div>
          <strong>${student.approved} / ${model.items.length} approved · ${student.percent}%</strong></div>
        ${!student.enrolled && !reviewRosterError ? '<p class="doc-help">Previous submissions to you · no longer enrolled in your class</p>' : ''}
        <div class="doc-progress-track" role="progressbar" aria-label="Approved document requirements" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${student.percent}"><span style="width:${student.percent}%"></span></div>
        <dl class="doc-progress-counts">
          <div><dt>Submitted</dt><dd>${student.submitted} / ${model.items.length}</dd></div>
          <div><dt>Awaiting review</dt><dd>${student.awaiting}</dd></div>
          <div><dt>Needs revision</dt><dd>${student.returned}</dd></div>
          <div><dt>Not submitted</dt><dd>${student.missing}</dd></div>
        </dl>
        <details><summary>View requirement checklist</summary><ul class="doc-progress-checklist">${student.items.map(item => `<li><span>${item.number}. ${esc(item.name)}</span>${item.status === 'missing' ? '<span class="doc-status">Not submitted</span>' : statusTag(item.status)}</li>`).join('')}</ul></details>
      </article>`).join('') : '<p class="doc-empty panel">No students match this view.</p>');
  }
  function render() { renderStudent(); if (currentPage === 'document-review') renderReview(); }

  async function reload(review = false) {
    if (!currentUser || busy) return;
    const userId = currentUser.id, version = generation, request = ++requestId;
    busy = true; errorMessage = ''; render();
    try {
      if (accountId !== userId || !context) await identify();
      if (!sameSession(version, userId)) return;
      if (review && !context?.is_coordinator) throw new Error('Coordinator access is required.');
      let query = supabase.from('ojt_documents').select('*');
      query = review ? query.eq('coordinator_id', userId).neq('status', 'draft').order('submitted_at', { ascending: false }) :
        query.eq('user_id', userId).order('created_at', { ascending: false });
      const results = await Promise.allSettled(review ? [query, supabase.rpc('ojt_list_students')] : [query]);
      if (!sameSession(version, userId) || request !== requestId) return;
      const result = results[0];
      if (result.status === 'rejected') throw result.reason;
      const { data, error } = result.value;
      if (error) throw error;
      if (review) {
        reviews = data || []; reviewProgressLoaded = true;
        const roster = results[1];
        if (roster.status === 'rejected' || roster.value.error) {
          reviewStudents = [];
          reviewRosterError = 'Student roster could not be loaded. Showing students with submissions only. Select Refresh to try again.';
        } else {
          reviewStudents = roster.value.data || []; reviewRosterError = '';
        }
        if (reviewStudentId && !model.reviewSummary(reviewStudents, reviews).some(student => student.id === reviewStudentId)) reviewStudentId = '';
      } else rows = data || [];
    } catch (error) {
      if (sameSession(version, userId)) {
        if (review) reviewProgressLoaded = false;
        errorMessage = friendlyError(error);
      }
    } finally {
      if (sameSession(version, userId) && request === requestId) {
        busy = false; render();
        if (desiredReview !== review && ['documents', 'document-review'].includes(currentPage)) await reload(desiredReview);
      }
    }
  }
  async function operate(action, review = false) {
    if (busy || !currentUser || accountId !== currentUser.id || !context) return;
    const userId = currentUser.id, version = generation;
    const guard = () => { if (!sameSession(version, userId)) throw new Error('Your session changed. Sign in again before continuing.'); };
    busy = true; errorMessage = ''; render();
    try { await action(userId, guard); }
    catch (error) { if (sameSession(version, userId)) errorMessage = friendlyError(error); }
    finally {
      if (sameSession(version, userId)) {
        busy = false; render();
        // Preserve action errors while fetching the resulting state.
        const actionError = errorMessage;
        await reload(['documents', 'document-review'].includes(currentPage) ? desiredReview : review);
        if (sameSession(version, userId) && actionError) { errorMessage = actionError; render(); }
      }
    }
  }
  async function upload(requirementId, files) {
    if (!model.items.some(item => item.id === requirementId) || !files.length || busy) return;
    for (const file of files) {
      const error = model.validate(file);
      if (error) { errorMessage = `${file.name}: ${error}`; render(); return; }
    }
    await operate(async (userId, guard) => {
      let saved = 0;
      const failures = [];
      for (const file of files) {
        guard();
        const ext = file.name.split('.').pop().toLowerCase();
        const path = `${userId}/${requirementId}/${crypto.randomUUID()}.${ext}`;
        try {
          const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: model.contentType(file), upsert: false });
          guard();
          if (error) throw error;
          const registered = await supabase.rpc('ojt_register_document', { p_requirement: requirementId, p_path: path, p_name: file.name });
          if (registered.error) {
            // The storage policy permits cleanup only if registration did not create a record.
            await supabase.storage.from(bucket).remove([path]);
            throw registered.error;
          }
          guard(); saved++;
        } catch (error) { guard(); failures.push(`${file.name}: ${error.message || 'Upload failed'}`); }
      }
      if (saved) showToast(`${saved} file${saved === 1 ? '' : 's'} uploaded as private drafts.`);
      if (failures.length) throw new Error(failures.join(' · '));
    });
  }
  async function submit(requirementId = null) {
    const ready = rows.filter(row => (!requirementId || row.requirement_id === requirementId) && ['draft', 'returned'].includes(row.status));
    if (!ready.length || !context?.recipient_id || busy) return;
    if (!confirm(`Submit ${ready.length} file${ready.length === 1 ? '' : 's'} to ${context.recipient_name}? Submitted files stay locked while awaiting review.`)) return;
    await operate(async (userId, guard) => {
      const { data, error } = await supabase.rpc('ojt_submit_documents', { p_ids: ready.map(row => row.id) });
      guard(); if (error) throw error;
      showToast(`${data} file${data === 1 ? '' : 's'} submitted for review.`);
    });
  }
  async function remove(id) {
    const row = rows.find(row => row.id === id && ['draft', 'returned'].includes(row.status));
    if (!row || busy || !confirm(`Remove “${row.file_name}”? You can upload a new version afterwards.`)) return;
    await operate(async (userId, guard) => {
      const { data, error } = await supabase.from('ojt_documents').delete().eq('id', row.id).eq('user_id', userId)
        .in('status', ['draft', 'returned']).select('id');
      guard(); if (error) throw error;
      if (!data?.length) throw new Error('This file was already submitted or changed. Refresh and try again.');
      const removed = await supabase.storage.from(bucket).remove([row.file_path]);
      guard(); if (removed.error) throw new Error('Removed from your checklist, but file cleanup failed. Please contact your coordinator.');
      showToast('File removed.');
    });
  }
  async function download(id, review = false) {
    const row = (review ? reviews : rows).find(row => row.id === id);
    if (!row || busy) return;
    await operate(async (userId, guard) => {
      const { data, error } = await supabase.storage.from(bucket).download(row.file_path);
      guard(); if (error) throw error;
      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url; link.download = row.file_name;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }, review);
  }
  async function connect(code) {
    const clean = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{8,32}$/.test(clean)) { errorMessage = 'Enter a valid coordinator code.'; render(); return; }
    let connected = false;
    const connectingUserId = currentUser?.id;
    await operate(async (userId, guard) => {
      const { error } = await supabase.rpc('ojt_join_coordinator', { p_code: clean });
      guard(); if (error) throw error;
      await identify(); guard(); connected = true;
      showToast('Coordinator connected. Account access will refresh to check your professor’s approval.');
    });
    if (connected && typeof Enrollment !== 'undefined') await Enrollment.refreshAccess(connectingUserId);
  }
  async function review(id, decision, feedbackText) {
    if (!context?.is_coordinator || !reviews.some(row => row.id === id && row.status === 'submitted')) return;
    if (decision === 'returned' && !feedbackText.trim()) { showToast('Add feedback explaining what needs revision.'); return; }
    if (!['approved', 'returned'].includes(decision)) return;
    reviewFeedback.set(id, feedbackText);
    await operate(async (userId, guard) => {
      const { error } = await supabase.rpc('ojt_review_document', { p_id: id, p_decision: decision, p_feedback: feedbackText.trim() });
      guard(); if (error) throw error;
      reviewFeedback.delete(id);
      showToast(decision === 'approved' ? 'Document approved.' : 'Document returned with feedback.');
    }, true);
  }
  function setup() {
    const studentPage = document.getElementById('page-documents');
    const reviewPage = document.getElementById('page-document-review');
    for (const page of [studentPage, reviewPage]) {
      page?.addEventListener('click', event => {
        const button = event.target.closest('[data-doc-action]');
        if (!button || button.disabled) return;
        const action = button.dataset.docAction;
        if (action === 'refresh') reload(page === reviewPage);
        if (action === 'download' || action === 'download-review') download(button.dataset.id, action === 'download-review');
        if (action === 'remove') remove(button.dataset.id);
        if (action === 'submit-all') submit();
        if (action === 'submit-requirement') submit(button.dataset.requirement);
      });
    }
    studentPage?.addEventListener('change', event => {
      if (event.target.matches('.doc-file-input')) upload(event.target.dataset.requirement, Array.from(event.target.files || []));
    });
    studentPage?.addEventListener('submit', event => {
      if (!event.target.matches('.doc-connect-form')) return;
      event.preventDefault(); connect(new FormData(event.target).get('code') || '');
    });
    reviewPage?.addEventListener('submit', event => {
      if (!event.target.matches('.doc-review-form')) return;
      event.preventDefault();
      review(event.target.dataset.id, event.submitter?.value, new FormData(event.target).get('feedback') || '');
    });
    reviewPage?.addEventListener('change', event => {
      if (event.target.id === 'doc-review-filter') { reviewFilter = event.target.value; renderReviewList(); }
      if (event.target.id === 'doc-review-student') { reviewStudentId = event.target.value; renderReviewList(); }
    });
    reviewPage?.addEventListener('input', event => {
      if (event.target.id === 'doc-review-search') { reviewSearch = event.target.value; renderReviewList(); }
      if (event.target.matches('.doc-review-form textarea')) {
        reviewFeedback.set(event.target.closest('.doc-review-form').dataset.id, event.target.value);
      }
    });
  }
  document.addEventListener('DOMContentLoaded', setup);
  return {
    open: () => { desiredReview = false; return reload(false); },
    openReview: () => { desiredReview = true; return reload(true); },
    initializeAccount, reset, upload, submit, remove, download, connect, review,
  };
})();
