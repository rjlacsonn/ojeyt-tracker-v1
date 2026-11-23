const AdminBadges = (() => {
  const el = id => document.getElementById('admin-badge-' + id);
  const esc = DocumentRequirements.escape;
  const metrics = {
    attendance_days: 'Attendance days', full_days: '8-hour days', accomplishment_days: 'Accomplishment days',
    best_streak: 'Best attendance streak', current_streak: 'Current attendance streak',
    total_hours: 'Total OJT hours', hours_percent: 'Percent of assigned hours',
  };
  const suggestions = [
    { id: 'suggestion-reflection-habit', name: 'Reflection Habit', icon: '📝', description: 'Record accomplishments on 5 different OJT days.', metric: 'accomplishment_days', goal: 5, xp: 100, order: 20 },
    { id: 'suggestion-century-club', name: 'Century Club', icon: '💯', description: 'Complete 100 total OJT hours.', metric: 'total_hours', goal: 100, xp: 175, order: 21 },
    { id: 'suggestion-momentum-maker', name: 'Momentum Maker', icon: '⚡', description: 'Build a 15-day attendance streak.', metric: 'best_streak', goal: 15, xp: 200, order: 22 },
  ];
  let badges = [], busy = false, version = 0, pending = null;
  const active = () => currentUser?.accountType === 'admin' && currentPage === 'admin';

  function reset() {
    version++; badges = []; busy = false; pending = null;
    if (el('confirm').open) el('confirm').close();
    el('status').textContent = ''; el('suggestions').replaceChildren();
    document.getElementById('admin-badges').replaceChildren();
    el('add').reset();
  }

  function suggestionsView() {
    el('suggestions').innerHTML = suggestions.map(suggestion => {
      const exists = badges.some(badge => badge.badge_id === suggestion.id);
      return `<article class="admin-badge-suggestion"><span aria-hidden="true">${esc(suggestion.icon)}</span><strong>${esc(suggestion.name)}</strong>
        <p>${esc(suggestion.description)} · ${suggestion.xp} XP</p>
        <button type="button" class="doc-button" data-badge-suggestion="${esc(suggestion.id)}" ${busy || exists ? 'disabled' : ''}>${exists ? 'Already added' : 'Use suggestion'}</button></article>`;
    }).join('');
  }

  function metricOptions(selected) {
    return Object.entries(metrics).map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
  }

  function list() {
    const rows = badges.map(badge => `<tr data-badge="${esc(badge.badge_id)}" class="${badge.is_active ? '' : 'admin-badge-inactive'}">
      <td><input aria-label="Badge icon" data-field="icon" maxlength="16" value="${esc(badge.icon)}" ${badge.is_active ? '' : 'disabled'}></td>
      <th scope="row"><input class="admin-badge-name" aria-label="Badge name" data-field="name" maxlength="80" value="${esc(badge.badge_name)}" ${badge.is_active ? '' : 'disabled'}></th>
      <td><input class="admin-badge-description-input" aria-label="Badge description" data-field="description" maxlength="240" value="${esc(badge.description)}" ${badge.is_active ? '' : 'disabled'}></td>
      <td><select aria-label="Badge measurement" data-field="metric" ${badge.is_active ? '' : 'disabled'}>${metricOptions(badge.metric_type)}</select></td>
      <td><input aria-label="Badge target" data-field="goal" type="number" min="1" max="10000" step="0.01" value="${esc(badge.goal_value)}" ${badge.is_active ? '' : 'disabled'}></td>
      <td><input aria-label="Badge XP" data-field="xp" type="number" min="0" max="10000" step="1" value="${esc(badge.xp_reward)}" ${badge.is_active ? '' : 'disabled'}></td>
      <td><input aria-label="Badge order" data-field="order" type="number" min="1" max="10000" step="1" value="${esc(badge.display_order)}" ${badge.is_active ? '' : 'disabled'}></td>
      <td>${badge.is_active ? '<span class="doc-status doc-status-approved">Active</span>' : '<span class="doc-status">Removed</span>'}</td>
      <td><div class="admin-requirement-actions">${badge.is_active ? `<button type="button" class="doc-button" data-badge-action="save" ${busy ? 'disabled' : ''}>Save</button><button type="button" class="doc-button student-danger-button" data-badge-action="deactivate" ${busy ? 'disabled' : ''}>Remove</button>` : `<button type="button" class="doc-button doc-button-primary" data-badge-action="restore" ${busy ? 'disabled' : ''}>Restore</button>`}</div></td>
    </tr>`).join('');
    document.getElementById('admin-badges').innerHTML = `<div class="admin-table"><table class="admin-badge-table"><thead><tr><th>Icon</th><th>Badge</th><th>Description</th><th>Measures</th><th>Target</th><th>XP</th><th>Order</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    suggestionsView();
  }

  async function load(message = '') {
    if (!active()) return;
    const token = ++version; busy = true; el('status').textContent = 'Loading badge settings…';
    try {
      const { data, error } = await supabase.rpc('ojt_badges', { p_include_inactive: true });
      if (token !== version || !active()) return;
      if (error) throw error;
      badges = data || []; Gamification.setBadges(badges.filter(badge => badge.is_active));
      busy = false; list(); el('status').textContent = message;
    } catch (error) {
      if (token === version) { badges = []; busy = false; list(); el('status').textContent = error.message || 'Could not load badge settings.'; }
    }
  }

  async function mutate(name, args, message) {
    if (busy || !active()) return;
    const token = version; busy = true; list(); el('status').textContent = 'Saving badge…';
    let resultMessage = message;
    try { const { error } = await supabase.rpc(name, args); if (error) throw error; }
    catch (error) { resultMessage = error.message || 'Could not save the badge.'; }
    if (version === token && active()) await load(resultMessage);
  }

  function saveArgs(source, id) {
    const value = field => source.querySelector(`[name="${field}"], [data-field="${field}"]`)?.value;
    return { p_id: id, p_name: value('name'), p_icon: value('icon'), p_description: value('description'),
      p_metric: value('metric'), p_goal: Number(value('goal')), p_xp: Number(value('xp')), p_order: Number(value('order')) };
  }

  el('add').onsubmit = event => {
    event.preventDefault();
    mutate('ojt_admin_save_badge', saveArgs(event.currentTarget, `custom-${crypto.randomUUID()}`), 'Badge added.');
  };
  el('suggestions').onclick = event => {
    const button = event.target.closest('[data-badge-suggestion]');
    if (!button || busy || !active()) return;
    const suggestion = suggestions.find(item => item.id === button.dataset.badgeSuggestion);
    if (!suggestion) return;
    mutate('ojt_admin_save_badge', { p_id: suggestion.id, p_name: suggestion.name, p_icon: suggestion.icon,
      p_description: suggestion.description, p_metric: suggestion.metric, p_goal: suggestion.goal,
      p_xp: suggestion.xp, p_order: suggestion.order }, 'Suggested badge added. You can customize it below.');
  };
  document.getElementById('admin-badges').onclick = event => {
    const button = event.target.closest('[data-badge-action]');
    if (!button || busy || !active()) return;
    const row = button.closest('[data-badge]');
    const badge = badges.find(item => item.badge_id === row?.dataset.badge);
    if (!badge) return;
    if (button.dataset.badgeAction === 'save') {
      mutate('ojt_admin_save_badge', saveArgs(row, badge.badge_id), 'Badge updated.');
    } else if (button.dataset.badgeAction === 'restore') {
      mutate('ojt_admin_set_badge_active', { p_id: badge.badge_id, p_active: true }, 'Badge restored.');
    } else {
      pending = badge;
      el('confirm-detail').textContent = `${badge.badge_name} will disappear from student badge collections and its XP reward will stop counting. Progress is derived from saved shifts and will return if the badge is restored.`;
      el('confirm').returnValue = ''; el('confirm').showModal();
    }
  };
  el('confirm').onclose = () => {
    const badge = pending; pending = null;
    if (!badge || el('confirm').returnValue !== 'apply' || busy || !active()) return;
    mutate('ojt_admin_set_badge_active', { p_id: badge.badge_id, p_active: false }, 'Badge removed.');
  };
  return { load, reset };
})();
