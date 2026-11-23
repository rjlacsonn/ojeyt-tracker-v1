const AdminDashboard = (() => {
  const el = id => document.getElementById('admin-' + id);
  const esc = DocumentRequirements.escape;
  let accounts = [], requirements = [], pending = null, version = 0, page = 0, busy = false;
  const pageSize = 25;
  const active = () => currentUser?.accountType === 'admin' && currentPage === 'admin';

  function reset() {
    version++; accounts = []; requirements = []; pending = null; busy = false; page = 0;
    if (el('confirm').open) el('confirm').close();
    el('refresh').disabled = false;
    for (const id of ['directory', 'requirements', 'stats', 'log', 'status', 'confirm-title', 'confirm-detail']) el(id).replaceChildren();
    el('search').value = ''; el('role').value = ''; el('requirement-add').reset();
  }

  function directory() {
    const term = el('search').value.trim().toLowerCase();
    const matches = accounts.filter(account => (!el('role').value || account.role === el('role').value) &&
      [account.name, account.email, account.coordinator].join(' ').toLowerCase().includes(term));
    page = Math.min(page, Math.max(0, Math.ceil(matches.length / pageSize) - 1));
    const first = page * pageSize;
    const rows = matches.slice(first, first + pageSize).map(account => {
      const action = account.role === 'Professor' ? 'Reset coordinator code' : account.role === 'Student' && account.coordinator_id ? 'Disconnect enrollment' : '';
      return `<tr><th scope="row">${esc(account.name)}<small>${esc(account.email)}</small></th><td>${esc(account.role)}</td><td>${esc(account.coordinator || (account.role === 'Student' ? 'Unconnected' : '—'))}</td><td>${account.role === 'Student' ? esc(account.hours) + ' / ' + esc(account.required_hours ?? 'Unassigned') : '—'}</td><td>${action ? `<button class="doc-button" data-account="${esc(account.id)}" data-action="${action}" ${busy ? 'disabled' : ''}>${action}</button>` : ''}</td></tr>`;
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
    el('directory').replaceChildren(); el('requirements').replaceChildren(); el('status').textContent = 'Loading administration…';
    try {
      const [overview, requirementResult] = await Promise.all([
        supabase.rpc('ojt_admin_overview'),
        supabase.rpc('ojt_document_requirements', { p_include_inactive: true }),
      ]);
      if (token !== version || !active()) return;
      if (overview.error) throw overview.error;
      if (requirementResult.error) throw requirementResult.error;
      accounts = overview.data.accounts;
      requirements = requirementResult.data || [];
      DocumentRequirements.setItems(requirements.filter(item => item.is_active));
      const counts = [['Students', accounts.filter(account => account.role === 'Student').length], ['Professors', accounts.filter(account => account.role === 'Professor').length], ['Files awaiting review', overview.data.awaiting]];
      el('stats').innerHTML = counts.map(([label, count]) => `<div><strong>${esc(count)}</strong><span>${label}</span></div>`).join('');
      el('log').innerHTML = overview.data.events.length ? overview.data.events.map(event => `<p><strong>${esc(event.action)}</strong> · ${esc(event.subject)}<small>${esc(event.actor)} · ${esc(new Date(event.happened_at).toLocaleString())}</small></p>`).join('') : '<p>No administrative actions recorded yet.</p>';
      busy = false; directory(); requirementList(); el('status').textContent = message;
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

  el('refresh').onclick = () => load();
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
    if (action.kind === 'requirement') mutate('ojt_admin_set_requirement_active', { p_id: action.id, p_active: false }, 'Requirement removed.');
    else mutate('ojt_admin_manage', action.args, 'Change saved.');
  };
  return { load, reset };
})();
