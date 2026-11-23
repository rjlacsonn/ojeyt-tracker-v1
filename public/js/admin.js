const AdminDashboard = (() => {
  const el = id => document.getElementById('admin-' + id);
  const esc = DocumentRequirements.escape;
  let accounts = [], pending = null, version = 0, page = 0, busy = false;
  const pageSize = 25;
  const active = () => currentUser?.accountType === 'admin' && currentPage === 'admin';
  function reset() {
    version++; accounts = []; pending = null; busy = false; page = 0;
    if (el('confirm').open) el('confirm').close();
    el('refresh').disabled = false;
    for (const id of ['directory','stats','log','status','confirm-title','confirm-detail']) el(id).replaceChildren();
    el('search').value = ''; el('role').value = '';
  }
  function directory() {
    const term = el('search').value.trim().toLowerCase();
    const matches = accounts.filter(a => (!el('role').value || a.role === el('role').value) &&
      [a.name,a.email,a.coordinator].join(' ').toLowerCase().includes(term));
    page = Math.min(page, Math.max(0, Math.ceil(matches.length / pageSize)-1));
    const first = page * pageSize;
    const rows = matches.slice(first,first+pageSize).map(a => {
      const action = a.role === 'Professor' ? 'Reset coordinator code' : a.role === 'Student' && a.coordinator_id ? 'Disconnect enrollment' : '';
      return `<tr><th scope="row">${esc(a.name)}<small>${esc(a.email)}</small></th><td>${esc(a.role)}</td><td>${esc(a.coordinator || (a.role === 'Student' ? 'Unconnected' : '—'))}</td><td>${a.role === 'Student' ? esc(a.hours) + ' / ' + esc(a.required_hours ?? 'Unassigned') : '—'}</td><td>${action ? `<button class="doc-button" data-account="${esc(a.id)}" data-action="${action}" ${busy?'disabled':''}>${action}</button>` : ''}</td></tr>`;
    });
    el('directory').innerHTML = matches.length ? `<div class="admin-table"><table><thead><tr><th>Account</th><th>Role</th><th>Coordinator</th><th>OJT hours</th><th>Action</th></tr></thead><tbody>${rows.join('')}</tbody></table></div><div class="doc-toolbar"><span>${first+1}–${Math.min(matches.length,first+pageSize)} of ${matches.length}</span><div><button class="doc-button" data-step="-1" ${page ? '' : 'disabled'}>Previous</button> <button class="doc-button" data-step="1" ${first+pageSize>=matches.length?'disabled':''}>Next</button></div></div>` : '<p>No accounts match this search.</p>';
  }
  async function load(message = '') {
    if (!active()) return;
    const token = ++version;
    busy = true; el('refresh').disabled = true;
    el('directory').replaceChildren(); el('status').textContent = 'Loading administration…';
    try {
      const {data,error} = await supabase.rpc('ojt_admin_overview');
      if (token !== version || !active()) return;
      if (error) throw error;
      accounts = data.accounts;
      const counts = [['Students',accounts.filter(a=>a.role==='Student').length],['Professors',accounts.filter(a=>a.role==='Professor').length],['Files awaiting review',data.awaiting]];
      el('stats').innerHTML = counts.map(([label,n])=>`<div><strong>${esc(n)}</strong><span>${label}</span></div>`).join('');
      el('log').innerHTML = data.events.length ? data.events.map(e=>`<p><strong>${esc(e.action)}</strong> · ${esc(e.subject)}<small>${esc(e.actor)} · ${esc(new Date(e.happened_at).toLocaleString())}</small></p>`).join('') : '<p>No administrative actions recorded yet.</p>';
      busy = false; directory(); el('status').textContent = message;
    } catch (error) {
      if (token === version) { reset(); el('status').textContent = error.message || 'Could not load administration.'; }
    } finally { if (token === version) { busy = false; el('refresh').disabled = false; } }
  }
  el('refresh').onclick = () => load();
  for (const id of ['search','role']) el(id).oninput = () => { if (!busy && active()) { page=0; directory(); } };
  el('directory').onclick = event => {
    const button = event.target.closest('button');
    if (!button || busy || !active()) return;
    if (button.dataset.step) { page += Number(button.dataset.step); directory(); return; }
    const account = accounts.find(a=>a.id===button.dataset.account);
    if (!account) return;
    pending = {p_user:account.id,p_action:button.dataset.action,p_coordinator:account.coordinator_id};
    el('confirm-title').textContent = pending.p_action + '?';
    el('confirm-detail').textContent = account.email + ' — ' + (pending.p_action === 'Reset coordinator code'
      ? 'The old code will expire. The professor can find the replacement on the Students page.'
      : 'This student will need a coordinator code to regain tracker access. Their hours and files are preserved.');
    el('confirm').returnValue = ''; el('confirm').showModal();
  };
  el('confirm').onclose = async () => {
    const args = pending; pending = null;
    if (!args || el('confirm').returnValue !== 'apply' || busy || !active()) return;
    const token = version; busy = true; el('refresh').disabled = true; directory();
    el('status').textContent = 'Saving…';
    let message = 'Change saved.';
    try { const {error} = await supabase.rpc('ojt_admin_manage',args); if (error) throw error; }
    catch (error) { message = error.message || 'Could not confirm the change.'; }
    if (version === token && active()) await load(message);
  };
  return {load,reset};
})();
