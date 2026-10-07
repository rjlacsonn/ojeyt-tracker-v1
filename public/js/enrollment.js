/* Professors manage only students who requested enrollment using their coordinator code. */
const Enrollment = (() => {
  let generation = 0, busy = false, students = [], rosterLoaded = false, joinCode = '', errorMessage = '';
  const esc = DocumentRequirements.escape;
  function reset() {
    generation++; busy = false; students = []; rosterLoaded = false; joinCode = ''; errorMessage = '';
    for (const id of ['student-approval-content', 'professor-students-content']) document.getElementById(id)?.replaceChildren();
  }
  function sameSession(version, id) { return generation === version && currentUser?.id === id; }
  function progressSummary(student) {
    const target = Number(student.required_hours);
    const hasTarget = Number.isFinite(target) && target > 0;
    const logged = student.logged_hours == null ? null : Number(student.logged_hours);
    const hasProgress = logged !== null && Number.isFinite(logged) && logged >= 0;
    const format = hours => `${Number(hours.toFixed(2)).toLocaleString()}h`;
    const remaining = hasTarget && hasProgress ? Math.max(0, target - logged) : null;
    const percent = remaining !== null ? Math.min(100, Math.round(logged / target * 100)) : null;
    return `<div class="student-progress-summary">
      <dl class="student-progress-stats">
        <div><dt>Assigned</dt><dd>${hasTarget ? format(target) : 'Not assigned'}</dd></div>
        <div><dt>Logged</dt><dd>${hasProgress ? format(logged) : 'Unavailable'}</dd></div>
        <div><dt>Remaining</dt><dd>${remaining !== null ? format(remaining) : hasTarget ? 'Unavailable' : 'Not assigned'}</dd></div>
        <div><dt>Completion</dt><dd>${percent !== null ? `${percent}%` : hasTarget ? 'Unavailable' : 'Not assigned'}</dd></div>
      </dl>
      ${percent !== null ? `<div class="student-progress-track" role="progressbar" aria-label="OJT completion" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span style="width:${percent}%"></span></div>` : ''}
      ${!hasProgress ? '<p>Progress is unavailable. Select Refresh to try again.</p>' : !hasTarget ? '<p>Assign required hours to see remaining hours and completion.</p>' : ''}
    </div>`;
  }
  function renderStudent() {
    const container = document.getElementById('student-approval-content');
    if (!container || currentUser?.accountType !== 'student') return;
    container.innerHTML = `<article class="panel account-status-panel">
      <span class="account-status-icon" aria-hidden="true">🎓</span>
      <h1>${currentUser.recipientId ? 'Waiting for your professor’s approval' : 'Connect to your OJT professor'}</h1>
      <p>${currentUser.recipientId ? `Your request was sent to <strong>${esc(currentUser.recipientName)}</strong>. Once your professor approves it, you can access your dashboard, badges, and documents.` : 'Your student account has been created. Enter the coordinator code shared by your professor to request access.'}</p>
      ${errorMessage ? `<p class="doc-error" role="alert">${esc(errorMessage)}</p>` : ''}
      <form id="student-enrollment-form" class="student-enrollment-form">
        <label class="field"><span>${currentUser.recipientId ? 'Change professor (optional)' : 'Professor / coordinator code'}</span>
          <input name="code" type="text" minlength="8" maxlength="32" autocomplete="off" autocapitalize="characters" placeholder="Enter your professor’s code" required ${busy ? 'disabled' : ''} /></label>
        <button type="submit" class="primary-btn" ${busy ? 'disabled' : ''}>${busy ? 'Sending…' : 'Request approval'}</button>
      </form>
      <button type="button" class="doc-button" data-enrollment-action="refresh" ${busy ? 'disabled' : ''}>Check approval status</button>
    </article>`;
  }
  function renderProfessor() {
    const container = document.getElementById('professor-students-content');
    if (!container || currentUser?.accountType !== 'professor') return;
    const pending = students.filter(student => student.approval_status === 'pending');
    const approved = students.filter(student => student.approval_status === 'approved');
    function cards(list, isPending) {
      return list.length ? list.map(student => `<article class="panel student-request-card">
        <div><h3>${esc(student.full_name || 'Student')}</h3><p>${esc(student.email)}</p></div>
        <form class="student-hours-form" data-student-id="${esc(student.student_id)}">
          <label class="field"><span>Required OJT hours</span>
            <input name="hours" type="number" min="1" max="10000" step="1" placeholder="Not assigned" value="${esc(student.required_hours ?? '')}" required ${busy ? 'disabled' : ''} /></label>
          <button type="submit" class="doc-button" ${busy ? 'disabled' : ''}>Save hours</button>
        </form>
        ${isPending ? `<button type="button" class="doc-button doc-button-primary" data-enrollment-action="approve" data-student-id="${esc(student.student_id)}" ${busy ? 'disabled' : ''}>Approve student</button>` : '<span class="doc-status doc-status-approved">Approved</span>'}
        ${progressSummary(student)}
      </article>`).join('') : `<p class="doc-empty">${isPending ? 'No students are waiting for approval.' : 'No approved students yet.'}</p>`;
    }
    container.innerHTML = `${busy ? '<p class="doc-notice" role="status">Updating students…</p>' : ''}
      ${errorMessage ? `<p class="doc-error" role="alert">${esc(errorMessage)}</p>` : ''}
      <article class="panel doc-recipient"><div><h2>Your account is active</h2><p>Share your coordinator code with your students. Approve their requests here to give them access to the tracker and document submissions.</p></div>
        <div class="doc-code"><span>Your coordinator code</span><strong>${esc(joinCode || (busy ? 'Loading…' : 'Unavailable'))}</strong></div></article>
      ${rosterLoaded ? `<h2 class="student-list-heading">Waiting for approval <span>${pending.length}</span></h2>${cards(pending, true)}
      <h2 class="student-list-heading">Approved students <span>${approved.length}</span></h2>${cards(approved, false)}`
      : `<p class="doc-notice" role="status">${busy ? 'Loading students…' : 'Student list could not be loaded. Select Refresh to try again.'}</p>`}`;
  }
  async function openProfessor() {
    if (busy || currentUser?.accountType !== 'professor' || currentUser.accountStatus !== 'active') return;
    const version = generation, id = currentUser.id;
    busy = true; errorMessage = ''; renderProfessor();
    try {
      const results = await Promise.allSettled([supabase.rpc('ojt_document_context'), supabase.rpc('ojt_list_students')]);
      if (!sameSession(version, id)) return;
      const [context, roster] = results.map(result => result.status === 'fulfilled' ? result.value : { error: result.reason });
      const errors = [];
      if (context.error) {
        joinCode = '';
        errors.push(`Could not load coordinator code: ${context.error.message || 'Please retry.'}`);
      } else {
        joinCode = context.data?.join_code || '';
        if (!joinCode) errors.push('Coordinator code is unavailable. Select Refresh to try again.');
      }
      if (roster.error) {
        students = []; rosterLoaded = false;
        errors.push(`Could not load students: ${roster.error.message || 'Please retry.'}`);
      } else {
        students = roster.data || []; rosterLoaded = true;
      }
      errorMessage = errors.join(' ');
    } catch (error) { if (sameSession(version, id)) errorMessage = error.message || 'Could not load students. Please retry.'; }
    finally { if (sameSession(version, id)) { busy = false; renderProfessor(); } }
  }
  async function refreshAccess(expectedUserId = currentUser?.id) {
    if (!expectedUserId || currentUser?.id !== expectedUserId) return;
    await loadUserData();
    if (currentUser?.id === expectedUserId) await showAppUI();
  }
  async function requestApproval(code) {
    if (busy || currentUser?.accountType !== 'student') return;
    const clean = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{8,32}$/.test(clean)) { errorMessage = 'Enter a valid coordinator code.'; renderStudent(); return; }
    const version = generation, id = currentUser.id;
    busy = true; errorMessage = ''; renderStudent();
    try {
      const { error } = await supabase.rpc('ojt_join_coordinator', { p_code: clean });
      if (!sameSession(version, id)) return;
      if (error) throw error;
      showToast('Approval request sent to your professor.');
      await refreshAccess(id);
    } catch (error) { if (sameSession(version, id)) errorMessage = error.message || 'Could not send your request.'; }
    finally { if (sameSession(version, id)) { busy = false; renderStudent(); } }
  }
  async function approve(studentId) {
    if (busy || currentUser?.accountType !== 'professor' || currentUser.accountStatus !== 'active' ||
        !students.some(student => student.student_id === studentId && student.approval_status === 'pending')) return;
    const version = generation, id = currentUser.id;
    busy = true; errorMessage = ''; renderProfessor();
    try {
      const { error } = await supabase.rpc('ojt_approve_student', { p_student_id: studentId });
      if (!sameSession(version, id)) return;
      if (error) throw error;
      students = students.map(student => student.student_id === studentId ? { ...student, approval_status: 'approved' } : student);
      showToast('Student approved. They can now access their tracker and submit documents.');
    } catch (error) { if (sameSession(version, id)) errorMessage = error.message || 'Could not approve this student.'; }
    finally { if (sameSession(version, id)) { busy = false; renderProfessor(); } }
  }
  async function setHours(studentId, value) {
    if (busy || currentUser?.accountType !== 'professor' || currentUser.accountStatus !== 'active' ||
        !students.some(student => student.student_id === studentId)) return;
    const hours = Number(value);
    if (!Number.isInteger(hours) || hours < 1 || hours > 10000) {
      errorMessage = 'Required OJT hours must be a whole number between 1 and 10,000.';
      renderProfessor(); return;
    }
    const version = generation, id = currentUser.id;
    busy = true; errorMessage = ''; renderProfessor();
    try {
      const { error } = await supabase.rpc('ojt_set_student_hours', { p_student_id: studentId, p_hours: hours });
      if (!sameSession(version, id)) return;
      if (error) throw error;
      students = students.map(student => student.student_id === studentId ? { ...student, required_hours: hours } : student);
      showToast('Required OJT hours updated. The student will see the new target after refreshing.');
    } catch (error) { if (sameSession(version, id)) errorMessage = error.message || 'Could not update required hours.'; }
    finally { if (sameSession(version, id)) { busy = false; renderProfessor(); } }
  }
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('page-student-approvals')?.addEventListener('submit', event => {
      if (!event.target.matches('.student-hours-form')) return;
      event.preventDefault();
      setHours(event.target.dataset.studentId, new FormData(event.target).get('hours'));
    });
    document.getElementById('page-student-home')?.addEventListener('submit', event => {
      if (event.target.id !== 'student-enrollment-form') return;
      event.preventDefault(); requestApproval(new FormData(event.target).get('code') || '');
    });
    for (const id of ['page-student-home', 'page-student-approvals']) {
      document.getElementById(id)?.addEventListener('click', event => {
        const button = event.target.closest('[data-enrollment-action]');
        if (!button || button.disabled) return;
        if (button.dataset.enrollmentAction === 'approve') approve(button.dataset.studentId);
        if (button.dataset.enrollmentAction === 'refresh') {
          if (id === 'page-student-approvals') openProfessor(); else refreshAccess();
        }
      });
    }
  });
  return { reset, openStudent: renderStudent, openProfessor, refreshAccess, requestApproval, approve, setHours };
})();
