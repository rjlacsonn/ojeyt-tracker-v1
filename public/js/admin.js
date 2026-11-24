const AdminDashboard = (() => {
  const el = id => document.getElementById('admin-' + id);
  const esc = DocumentRequirements.escape;
  let accounts = [], requirements = [], pending = null, version = 0, page = 0, busy = false;
  const pageSize = 25;
  const active = () => currentUser?.accountType === 'admin' && currentPage === 'admin';
  let verifiedSuperAdmin = false;
  const superAdmin = () => active() && verifiedSuperAdmin;

  function reset() {
    version++; accounts = []; requirements = []; pending = null; busy = false; page = 0; verifiedSuperAdmin = false;
    if (el('confirm').open) el('confirm').close();
    if (el('delete-confirm').open) el('delete-confirm').close();
    if (el('coordinator-confirm').open) el('coordinator-confirm').close();
    el('refresh').disabled = false;
    for (const id of ['directory', 'requirements', 'stats', 'log', 'status', 'confirm-title', 'confirm-detail']) el(id).replaceChildren();
    el('search').value = ''; el('role').value = ''; el('requirement-add').reset(); el('delete-confirm-input').value = '';
    el('grant-form').hidden = true; el('grant-form').reset();
    el('management').hidden = true;
  }

  function directory() {
    el('management').hidden = !superAdmin();
    el('grant-form').hidden = !superAdmin();
    el('grant-form').querySelector('button').disabled = busy;
    const term = el('search').value.trim().toLowerCase();
    const matches = accounts.filter(account => (!el('role').value || account.role === el('role').value) &&
      [account.name, account.email, account.coordinator].join(' ').toLowerCase().includes(term));
    page = Math.min(page, Math.max(0, Math.ceil(matches.length / pageSize) - 1));
    const first = page * pageSize;
    const rows = matches.slice(first, first + pageSize).map(account => {
      const action = account.role === 'Professor' ? 'Reset coordinator code' : account.role === 'Student' && account.coordinator_id ? 'Disconnect enrollment' : '';
      const isCurrentAccount = account.id === currentUser?.id;
      const administrator = ['Administrator', 'Super Admin'].includes(account.role);
      const canManage = !isCurrentAccount && account.role !== 'Super Admin' && (!administrator || superAdmin());
      const actions = [
        account.role === 'Student' && canManage && !account.disabled ? `<button class="doc-button" data-account="${esc(account.id)}" data-action="Change coordinator" ${busy ? 'disabled' : ''}>Change coordinator</button>` : '',
        action && canManage && !account.disabled ? `<button class="doc-button" data-account="${esc(account.id)}" data-action="${action}" ${busy ? 'disabled' : ''}>${action}</button>` : '',
        canManage ? `<button class="doc-button" data-account="${esc(account.id)}" data-action="${account.disabled ? 'Enable user' : 'Disable user'}" ${busy ? 'disabled' : ''}>${account.disabled ? 'Enable user' : 'Disable user'}</button>` : '',
        canManage && superAdmin() && administrator ? `<button class="doc-button" data-account="${esc(account.id)}" data-action="Remove admin access" ${busy ? 'disabled' : ''}>Remove admin access</button>` : '',
        isCurrentAccount ? '<small>Current account</small>' : canManage && superAdmin() ? `<button class="doc-button student-danger-button" data-account="${esc(account.id)}" data-action="Delete user" ${busy ? 'disabled' : ''}>Delete user</button>` : '',
      ].filter(Boolean).join('');
      return `<tr><th scope="row">${esc(account.name)}<small>${esc(account.email)}</small><span class="doc-status">${account.disabled ? 'Disabled' : 'Enabled'}</span></th><td>${esc(account.role)}</td><td>${esc(account.coordinator || (account.role === 'Student' ? 'Unconnected' : '—'))}</td><td>${account.role === 'Student' ? esc(account.hours) + ' / ' + esc(account.required_hours ?? 'Unassigned') : '—'}</td><td><div class="admin-account-actions">${actions}</div></td></tr>`;
    });
    el('directory').innerHTML = matches.length ? `<div class="admin-table"><table><thead><tr><th>Account</th><th>Role</th><th>Coordinator</th><th>OJT hours</th><th>Action</th></tr></thead><tbody>${rows.join('')}</tbody></table></div><div class="doc-toolbar"><span>${first + 1}–${Math.min(matches.length, first + pageSize)} of ${matches.length}</span><div><button class="doc-button" data-step="-1" ${page ? '' : 'disabled'}>Previous</button> <button class="doc-button" data-step="1" ${first + pageSize >= matches.length ? 'disabled' : ''}>Next</button></div></div>` : '<p>No accounts match this search.</p>';
  }

  function requirementList() {
    const rows = requirements.map(requirement => `<tr data-requirement="${esc(requirement.requirement_id)}" class="${requirement.is_active ? '' : 'admin-requirement-inactive'}">
      <th scope="row"><input aria-label="Section name" data-field="name" maxlength="120" value="${esc(requirement.requirement_name)}" ${requirement.is_active ? '' : 'disabled'}></th>
      <td><input aria-label="Section number" data-field="number" type="number" min="1" max="9999" value="${esc(requirement.requirement_number)}" ${requirement.is_active ? '' : 'disabled'}></td>
      <td><input aria-label="Display order" data-field="order" type="number" min="1" max="10000" value="${esc(requirement.display_order)}" ${requirement.is_active ? '' : 'disabled'}></td>
      <td>${requirement.is_active ? '<span class="doc-status doc-status-approved">Active</span>' : '<span class="doc-status">Removed</span>'}</td>
      <td><div class="admin-requirement-actions">${requirement.is_active ? `<button class="doc-button" data-requirement-action="save" ${busy ? 'disabled' : ''}>Save</button><button class="doc-button student-danger-button" data-requirement-action="deactivate" ${busy ? 'disabled' : ''}>Remove</button>` : `<button class="doc-button doc-button-primary" data-requirement-action="restore" ${busy ? 'disabled' : ''}>Restore</button>`}</div></td>
    </tr>`).join('');
    el('requirements').innerHTML = `<div class="admin-table"><table><thead><tr><th>Section</th><th>Number</th><th>Order</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  async function load(message = '') {
    if (!active()) return;
    const token = ++version;
    busy = true; el('refresh').disabled = true;
    verifiedSuperAdmin = false; el('management').hidden = true; el('grant-form').hidden = true;
    el('directory').replaceChildren(); el('requirements').replaceChildren(); el('status').textContent = 'Loading administration…';
    try {
      const [overview, requirementResult, superAdminResult] = await Promise.all([
        supabase.rpc('ojt_admin_overview'),
        supabase.rpc('ojt_document_requirements', { p_include_inactive: true }),
        supabase.rpc('ojt_is_super_admin'),
      ]);
      if (token !== version || !active()) return;
      if (overview.error) throw overview.error;
      if (requirementResult.error) throw requirementResult.error;
      if (superAdminResult.error) throw new Error('Could not verify Super Admin access. Apply the Super Admin migration, then refresh Administration.');
      verifiedSuperAdmin = superAdminResult.data === true;
      currentUser.adminRole = verifiedSuperAdmin ? 'super_admin' : 'admin';
      const roleLabel = document.getElementById('account-role-label');
      if (roleLabel) roleLabel.textContent = verifiedSuperAdmin ? 'Super Admin' : 'Administrator';
      accounts = overview.data.accounts;
      requirements = requirementResult.data || [];
      DocumentRequirements.setItems(requirements.filter(item => item.is_active));
      const counts = [['Students', accounts.filter(account => account.role === 'Student').length], ['Professors', accounts.filter(account => account.role === 'Professor').length], ['Files awaiting review', overview.data.awaiting]];
      el('stats').innerHTML = counts.map(([label, count]) => `<div><strong>${esc(count)}</strong><span>${label}</span></div>`).join('');
      el('log').innerHTML = overview.data.events.length ? overview.data.events.map(event => `<p><strong>${esc(event.action)}</strong> · ${esc(event.subject)}<small>${esc(event.actor)} · ${esc(new Date(event.happened_at).toLocaleString())}</small></p>`).join('') : '<p>No administrative actions recorded yet.</p>';
      busy = false; directory(); requirementList(); el('status').textContent = '';
      if (message) showToast(message);
    } catch (error) {
      if (token === version) { reset(); el('status').textContent = error.message || 'Could not load administration.'; }
    } finally { if (token === version) { busy = false; el('refresh').disabled = false; } }
  }

  async function mutate(name, args, message) {
    if (busy || !active()) return;
    const token = version; busy = true; el('refresh').disabled = true; directory(); requirementList();
    el('status').textContent = 'Saving…';
    let resultMessage = message;
    try { const { error } = await supabase.rpc(name, args); if (error) throw error; }
    catch (error) { resultMessage = error.message || 'Could not save the requirement.'; }
    if (version === token && active()) await load(resultMessage);
  }

  async function removeStoredFiles(bucket, paths) {
    for (let index = 0; index < paths.length; index += 100) {
      const { error } = await supabase.storage.from(bucket).remove(paths.slice(index, index + 100));
      if (error) throw error;
    }
  }

  async function deleteAccount(account) {
    if (busy || !superAdmin() || account.id === currentUser?.id) return;
    const token = version; busy = true; el('refresh').disabled = true; directory(); requirementList();
    el('status').textContent = `Deleting ${account.email}…`;
    let resultMessage = 'User permanently deleted.';
    try {
      const { data: paths, error: pathsError } = await supabase.rpc('ojt_admin_account_storage_paths', { p_user: account.id });
      if (pathsError) throw pathsError;
      const cleanup = await Promise.allSettled([
        removeStoredFiles('ojt-documents', Array.isArray(paths?.document_paths) ? paths.document_paths : []),
        removeStoredFiles('profile-pictures', Array.isArray(paths?.profile_picture_paths) ? paths.profile_picture_paths : []),
      ]);
      if (cleanup.some(result => result.status === 'rejected')) {
        throw new Error('The user was not deleted because some uploaded files could not be removed. Retry, or check Supabase Storage.');
      }
      const { error } = await supabase.rpc('ojt_admin_delete_account', { p_user: account.id });
      if (error) throw error;
    } catch (error) { resultMessage = error.message || 'Could not delete the user.'; }
    if (version === token && active()) await load(resultMessage);
  }

  el('refresh').onclick = () => load();
  el('grant-form').onsubmit = event => {
    event.preventDefault();
    if (busy || !superAdmin()) return;
    pending = { kind: 'grant-admin', email: new FormData(event.currentTarget).get('email').trim() };
    el('confirm-title').textContent = 'Add administrator?';
    el('confirm-detail').textContent = `${pending.email} will receive administrator access to the dashboard and user management.`;
    el('confirm').returnValue = ''; el('confirm').showModal();
  };
  for (const id of ['search', 'role']) el(id).oninput = () => { if (!busy && active()) { page = 0; directory(); } };
  el('requirement-add').onsubmit = event => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    mutate('ojt_admin_save_requirement', {
      p_id: `custom-${crypto.randomUUID()}`,
      p_name: values.get('name'), p_number: Number(values.get('number')), p_order: Number(values.get('order')),
    }, 'Requirement added.');
  };
  el('requirements').onclick = event => {
    const button = event.target.closest('[data-requirement-action]');
    if (!button || busy || !active()) return;
    const row = button.closest('[data-requirement]');
    const requirement = requirements.find(item => item.requirement_id === row?.dataset.requirement);
    if (!requirement) return;
    if (button.dataset.requirementAction === 'save') {
      mutate('ojt_admin_save_requirement', { p_id: requirement.requirement_id,
        p_name: row.querySelector('[data-field="name"]').value,
        p_number: Number(row.querySelector('[data-field="number"]').value),
        p_order: Number(row.querySelector('[data-field="order"]').value) }, 'Requirement updated.');
    } else if (button.dataset.requirementAction === 'restore') {
      mutate('ojt_admin_set_requirement_active', { p_id: requirement.requirement_id, p_active: true }, 'Requirement restored.');
    } else {
      pending = { kind: 'requirement', id: requirement.requirement_id, name: requirement.requirement_name };
      el('confirm-title').textContent = 'Remove this requirement?';
      el('confirm-detail').textContent = `${requirement.requirement_name} will disappear from student checklists and will not count toward OJT completion. Existing files will be preserved, and an administrator can restore it later.`;
      el('confirm').returnValue = ''; el('confirm').showModal();
    }
  };
  el('directory').onclick = event => {
    const button = event.target.closest('button');
    if (!button || busy || !active()) return;
    if (button.dataset.step) { page += Number(button.dataset.step); directory(); return; }
    const account = accounts.find(item => item.id === button.dataset.account);
    if (!account) return;
    if (button.dataset.action === 'Change coordinator') {
      if (account.role !== 'Student' || account.disabled) return;
      pending = { kind: 'coordinator', student: account.id, expected: account.coordinator_id || null };
      el('coordinator-student').textContent = `${account.name} (${account.email})`;
      el('coordinator-current').textContent = account.coordinator || 'Unconnected';
      const choices = accounts.filter(item => item.role === 'Professor' && !item.disabled && item.id !== account.coordinator_id);
      el('coordinator-select').innerHTML = `<option value="">${choices.length ? 'Choose a coordinator' : 'No other enabled professors available'}</option>` +
        choices.map(item => `<option value="${esc(item.id)}">${esc(item.name)} — ${esc(item.email)}</option>`).join('');
      el('coordinator-select').value = ''; el('coordinator-apply').disabled = true;
      el('coordinator-confirm').returnValue = ''; el('coordinator-confirm').showModal();
      return;
    }
    if (button.dataset.action === 'Delete user') {
      if (!superAdmin()) return;
      pending = { kind: 'delete-account', account };
      el('delete-confirm-email').textContent = account.email;
      const relatedImpact = account.role === 'Professor'
        ? " Connected students will be disconnected, but the students' own records will remain."
        : '';
      el('delete-confirm-detail').textContent = `${account.name} (${account.role}) will lose access immediately. Their account, profile, enrollment, logged hours, sessions, and document records will be permanently deleted.${relatedImpact}`;
      el('delete-confirm-input').value = ''; el('delete-confirm-apply').disabled = true;
      el('delete-confirm').returnValue = ''; el('delete-confirm').showModal(); el('delete-confirm-input').focus();
      return;
    }
    if (['Disable user', 'Enable user', 'Remove admin access'].includes(button.dataset.action)) {
      pending = { kind: 'access', id: account.id, action: button.dataset.action };
      el('confirm-title').textContent = button.dataset.action + '?';
      el('confirm-detail').textContent = `${account.email} — ` + (button.dataset.action === 'Disable user'
        ? 'System access will be blocked. Account records, hours, and files will be preserved. You can enable the account again later.'
        : button.dataset.action === 'Enable user' ? 'System access will be restored.' : 'Administrator privileges will be removed. The account and records will be preserved.');
      el('confirm').returnValue = ''; el('confirm').showModal();
      return;
    }
    pending = { kind: 'account', args: { p_user: account.id, p_action: button.dataset.action, p_coordinator: account.coordinator_id } };
    el('confirm-title').textContent = button.dataset.action + '?';
    el('confirm-detail').textContent = account.email + ' — ' + (button.dataset.action === 'Reset coordinator code'
      ? 'The old code will expire. The professor can find the replacement on the Students page.'
      : 'This student will need a coordinator code to regain tracker access. Their hours and files are preserved.');
    el('confirm').returnValue = ''; el('confirm').showModal();
  };
  el('confirm').onclose = () => {
    const action = pending; pending = null;
    if (!action || el('confirm').returnValue !== 'apply' || busy || !active()) return;
    if (action.kind === 'grant-admin') mutate('ojt_super_admin_grant_admin', { p_email: action.email }, 'Administrator added.');
    else if (action.kind === 'access') mutate('ojt_admin_set_account_access', { p_user: action.id, p_action: action.action }, 'Account access updated.');
    else if (action.kind === 'requirement') mutate('ojt_admin_set_requirement_active', { p_id: action.id, p_active: false }, 'Requirement removed.');
    else mutate('ojt_admin_manage', action.args, 'Change saved.');
  };
  el('delete-confirm-input').oninput = () => {
    const expected = pending?.kind === 'delete-account' ? pending.account.email : '';
    el('delete-confirm-apply').disabled = el('delete-confirm-input').value.trim().toLowerCase() !== String(expected).toLowerCase();
  };
  el('coordinator-select').onchange = () => {
    el('coordinator-apply').disabled = !el('coordinator-select').value;
  };
  el('coordinator-confirm').onclose = () => {
    const action = pending; pending = null;
    const coordinator = el('coordinator-select').value;
    el('coordinator-select').value = ''; el('coordinator-apply').disabled = true;
    if (action?.kind !== 'coordinator' || el('coordinator-confirm').returnValue !== 'apply' || busy || !active()) return;
    if (!accounts.some(item => item.id === coordinator && item.role === 'Professor' && !item.disabled)) return;
    mutate('ojt_admin_change_coordinator', { p_student: action.student, p_coordinator: coordinator,
      p_expected_coordinator: action.expected }, 'Student coordinator updated.');
  };
  el('delete-confirm').onclose = () => {
    const action = pending; pending = null;
    const confirmed = action?.kind === 'delete-account' && el('delete-confirm').returnValue === 'delete' &&
      el('delete-confirm-input').value.trim().toLowerCase() === String(action.account.email).toLowerCase();
    el('delete-confirm-input').value = ''; el('delete-confirm-apply').disabled = true;
    if (confirmed && !busy && active()) deleteAccount(action.account);
  };
  return { load, reset };
})();
