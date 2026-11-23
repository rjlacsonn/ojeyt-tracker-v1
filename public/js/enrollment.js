/* Students join a professor immediately by entering that professor's coordinator code. */
const Enrollment = (() => {
  let generation = 0, busy = false, students = [], rosterLoaded = false, joinCode = '', errorMessage = '';
  let studentSearch = '', confirmation = null;
  const esc = DocumentRequirements.escape;
  function reset() {
    generation++; busy = false; students = []; rosterLoaded = false; joinCode = ''; errorMessage = '';
    studentSearch = ''; confirmation = null;
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
      <h1>Connect to your OJT professor</h1>
      <p>Enter the coordinator code shared by your professor to join their student list and access your tracker immediately.</p>
      ${errorMessage ? `<p class="doc-error" role="alert">${esc(errorMessage)}</p>` : ''}
      <form id="student-enrollment-form" class="student-enrollment-form">
        <label class="field"><span>Professor / coordinator code</span>
          <input name="code" type="text" minlength="6" maxlength="32" autocomplete="off" autocapitalize="characters" placeholder="Enter your professor’s code" required ${busy ? 'disabled' : ''} /></label>
        <button type="submit" class="primary-btn" ${busy ? 'disabled' : ''}>${busy ? 'Connecting…' : 'Join professor'}</button>
      </form>
    </article>`;
  }
  const requiredDocuments = DocumentRequirements.items.length;
  function isComplete(student) {
    const target = Number(student.required_hours);
    const logged = Number(student.logged_hours);
    return Number(student.approved_requirements) === requiredDocuments && Number.isFinite(target) && target > 0 &&
      Number.isFinite(logged) && logged >= target;
  }
  function matchingStudents() {
    const query = studentSearch.trim().toLocaleLowerCase();
    if (!query) return students;
    return students.filter(student => `${student.full_name || ''} ${student.email || ''}`.toLocaleLowerCase().includes(query));
  }
  function studentCards() {
    const matches = matchingStudents();
    if (!students.length) return '<p class="doc-empty">No students have joined yet.</p>';
    if (!matches.length) return `<p class="doc-empty">No students match “${esc(studentSearch.trim())}”.</p>`;
    return matches.map(student => {
      const approved = Math.max(0, Math.min(requiredDocuments, Number(student.approved_requirements) || 0));
      const complete = isComplete(student);
      const target = Number(student.required_hours);
      const logged = Number(student.logged_hours);
      const hoursLabel = Number.isFinite(target) && target > 0 && Number.isFinite(logged)
        ? `${Number(logged.toFixed(2)).toLocaleString()}/${Number(target.toFixed(2)).toLocaleString()}h`
        : 'hours not assigned';
      return `<article class="panel student-request-card">
        <div><h3>${esc(student.full_name || 'Student')}</h3><p>${esc(student.email)}</p></div>
        <form class="student-hours-form" data-student-id="${esc(student.student_id)}">
          <label class="field"><span>Required OJT hours</span>
            <input name="hours" type="number" min="1" max="10000" step="1" placeholder="Not assigned" value="${esc(student.required_hours ?? '')}" required ${busy ? 'disabled' : ''} /></label>
          <button type="submit" class="doc-button" ${busy ? 'disabled' : ''}>Save hours</button>
        </form>
        <div class="student-card-actions">
          <span class="doc-status ${complete ? 'doc-status-approved' : 'doc-status-submitted'}">${complete ? 'OJT complete' : `${approved}/${requiredDocuments} documents · ${hoursLabel}`}</span>
          ${complete ? `<button type="button" class="doc-button student-remove-button" data-enrollment-action="remove-student" data-student-id="${esc(student.student_id)}" ${busy ? 'disabled' : ''}>Remove student</button>` : ''}
        </div>
        ${progressSummary(student)}
      </article>`;
    }).join('');
  }
  function renderStudentResults() {
    const results = document.getElementById('professor-student-results');
    if (results) results.innerHTML = studentCards();
    const count = document.getElementById('student-search-count');
    if (count) count.textContent = studentSearch.trim() ? `${matchingStudents().length} of ${students.length}` : String(students.length);
  }
  function confirmationModal() {
    if (!confirmation) return '';
    const all = confirmation.type === 'all';
    return `<div class="modal student-confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="student-confirmation-title">
      <div class="modal-overlay" data-enrollment-action="cancel-removal"></div>
      <div class="modal-content student-confirmation-content">
        <h2 id="student-confirmation-title">${all ? 'Clear completed students?' : 'Remove completed student?'}</h2>
        <p>${all
          ? `Remove all ${students.length} completed students from your active roster?`
          : `Remove ${esc(confirmation.name)} from your active roster?`}</p>
        <p class="student-confirmation-note">Student accounts, logged hours, and document history will be preserved. ${all ? 'These students' : 'This student'} will return to the coordinator-code screen and must enter a valid code again to regain tracker access.</p>
        <div class="modal-actions">
          <button type="button" class="doc-button" data-enrollment-action="cancel-removal">Cancel</button>
          <button type="button" class="doc-button student-danger-button" data-enrollment-action="confirm-removal" autofocus>${all ? 'Clear roster' : 'Remove student'}</button>
        </div>
      </div>
    </div>`;
  }
  function renderProfessor() {
    const container = document.getElementById('professor-students-content');
    if (!container || currentUser?.accountType !== 'professor') return;
    const allComplete = students.length > 0 && students.every(isComplete);
    container.innerHTML = `${busy ? '<p class="doc-notice" role="status">Updating students…</p>' : ''}
      ${errorMessage ? `<p class="doc-error" role="alert">${esc(errorMessage)}</p>` : ''}
      <article class="panel doc-recipient"><div><h2>Your account is active</h2><p>Share your coordinator code with your students. Students who enter it receive access immediately and appear in this list.</p></div>
        <div class="doc-code"><span>Your coordinator code</span><strong>${esc(joinCode || (busy ? 'Loading…' : 'Unavailable'))}</strong></div></article>
      ${rosterLoaded ? `<div class="student-roster-toolbar">
        <label class="student-search-field" for="student-search"><span>Find a student</span><input id="student-search" type="search" placeholder="Search by name or email" autocomplete="off" value="${esc(studentSearch)}" /></label>
        <button type="button" class="doc-button student-danger-button" data-enrollment-action="clear-students" ${busy || !allComplete ? 'disabled' : ''} title="${allComplete ? 'Remove all completed students from the active roster' : 'Every student must complete all document requirements and assigned OJT hours first'}">Clear completed roster</button>
      </div>
      <h2 class="student-list-heading">Students <span id="student-search-count">${students.length}</span></h2>
      <div id="professor-student-results">${studentCards()}</div>`
      : `<p class="doc-notice" role="status">${busy ? 'Loading students…' : 'Student list could not be loaded. Select Refresh to try again.'}</p>`}
      ${confirmationModal()}`;
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
  async function joinProfessor(code) {
    if (busy || currentUser?.accountType !== 'student') return;
    const clean = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{6,32}$/.test(clean)) { errorMessage = 'Enter a valid coordinator code.'; renderStudent(); return; }
    const version = generation, id = currentUser.id;
    busy = true; errorMessage = ''; renderStudent();
    try {
      const { error } = await supabase.rpc('ojt_join_coordinator', { p_code: clean });
      if (!sameSession(version, id)) return;
      if (error) throw error;
      showToast('Connected to your professor. Your tracker is now active.');
      await refreshAccess(id);
    } catch (error) { if (sameSession(version, id)) errorMessage = error.message || 'Could not connect to your professor.'; }
    finally { if (sameSession(version, id)) { busy = false; renderStudent(); } }
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
  function setSearch(value) {
    studentSearch = String(value || '');
    renderStudentResults();
  }
  function openRemoval(studentId = null) {
    if (busy || currentUser?.accountType !== 'professor' || currentUser.accountStatus !== 'active') return;
    if (studentId) {
      const student = students.find(item => item.student_id === studentId && isComplete(item));
      if (!student) return;
      confirmation = { type: 'student', studentId, name: student.full_name || student.email || 'this student' };
    } else {
      if (!students.length || !students.every(isComplete)) return;
      confirmation = { type: 'all' };
    }
    renderProfessor();
    document.querySelector?.('[data-enrollment-action="confirm-removal"]')?.focus();
  }
  function cancelRemoval() {
    if (!confirmation) return;
    confirmation = null;
    renderProfessor();
    document.getElementById('student-search')?.focus?.();
  }
  async function confirmRemoval() {
    if (!confirmation || busy || currentUser?.accountType !== 'professor' || currentUser.accountStatus !== 'active') return;
    const action = confirmation, version = generation, id = currentUser.id;
    confirmation = null; busy = true; errorMessage = ''; renderProfessor();
    try {
      if (action.type === 'all') {
        const { data, error } = await supabase.rpc('ojt_archive_all_completed_students');
        if (!sameSession(version, id)) return;
        if (error) throw error;
        students = [];
        showToast(`${Number(data) || 0} completed student${Number(data) === 1 ? '' : 's'} removed. They must enter a coordinator code to reconnect.`);
      } else {
        const { error } = await supabase.rpc('ojt_archive_completed_student', { p_student_id: action.studentId });
        if (!sameSession(version, id)) return;
        if (error) throw error;
        students = students.filter(student => student.student_id !== action.studentId);
        showToast(`${action.name} was removed and must enter a coordinator code to reconnect.`);
      }
    } catch (error) { if (sameSession(version, id)) errorMessage = error.message || 'Could not update the student roster.'; }
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
      event.preventDefault(); joinProfessor(new FormData(event.target).get('code') || '');
    });
    for (const id of ['page-student-home', 'page-student-approvals']) {
      document.getElementById(id)?.addEventListener('click', event => {
        const button = event.target.closest('[data-enrollment-action]');
        if (!button || button.disabled) return;
        if (button.dataset.enrollmentAction === 'remove-student') openRemoval(button.dataset.studentId);
        if (button.dataset.enrollmentAction === 'clear-students') openRemoval();
        if (button.dataset.enrollmentAction === 'cancel-removal') cancelRemoval();
        if (button.dataset.enrollmentAction === 'confirm-removal') confirmRemoval();
        if (button.dataset.enrollmentAction === 'refresh') {
          if (id === 'page-student-approvals') openProfessor(); else refreshAccess();
        }
      });
    }
    document.getElementById('page-student-approvals')?.addEventListener('input', event => {
      if (event.target.id === 'student-search') setSearch(event.target.value);
    });
    document.getElementById('page-student-approvals')?.addEventListener('keydown', event => {
      if (event.key === 'Escape' && confirmation) { event.preventDefault(); cancelRemoval(); }
    });
  });
  return { reset, openStudent: renderStudent, openProfessor, refreshAccess, joinProfessor, setHours,
    setSearch, openRemoval, cancelRemoval, confirmRemoval };
})();
