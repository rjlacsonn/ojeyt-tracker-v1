/* Shift logging activity: creation timestamps, never work dates or login events. */
const ShiftActivity = (() => {
  const zone = 'Asia/Manila';
  const dayMs = 86400000;
  let resizeObserver = null;
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' });
  function dateKey(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return null;
    const parts = Object.fromEntries(formatter.formatToParts(date).map(p => [p.type, p.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  const epoch = key => Date.parse(key + 'T00:00:00Z');
  const keyAt = value => new Date(value).toISOString().slice(0, 10);
  function build(shifts, now = new Date(), days = 365) {
    const today = dateKey(now);
    if (!today) throw new Error('A valid current date is required.');
    days = days === 90 ? 90 : 365;
    const end = epoch(today), start = end - (days - 1) * dayMs;
    const counts = new Map(), seen = new Set();
    let unknown = 0;
    for (const shift of shifts || []) {
      if (!shift || (shift.id && seen.has(shift.id))) continue;
      if (shift.id) seen.add(shift.id);
      // Supabase returns ISO timestamps with an offset. Missing timestamps are not inferred.
      const timestamp = shift.created_at;
      const key = typeof timestamp === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp) ? dateKey(timestamp) : null;
      if (!key) { unknown++; continue; }
      if (new Date(timestamp).getTime() > new Date(now).getTime()) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const first = start - new Date(start).getUTCDay() * dayMs;
    const columns = Math.ceil((end - first + dayMs) / (7 * dayMs));
    const cells = Array.from({ length: columns * 7 }, (_, index) => {
      const time = first + index * dayMs, key = keyAt(time);
      const available = time >= start && time <= end;
      const count = available ? counts.get(key) || 0 : 0;
      return { key, available, count, level: Math.min(count, 4), column: Math.floor(index / 7), row: index % 7 };
    });
    const valid = cells.filter(cell => cell.available);
    const total = valid.reduce((sum, cell) => sum + cell.count, 0);
    const activeDays = valid.filter(cell => cell.count).length;
    const lastSaved = [...counts.keys()].sort().at(-1) || null;
    const gap = lastSaved ? Math.round((end - epoch(lastSaved)) / dayMs) : null;
    return { cells, columns, today, start: keyAt(start), days, total, activeDays, lastSaved, gap, unknown };
  }
  function label(cell) {
    const date = new Date(cell.key + 'T12:00:00Z').toLocaleDateString('en-PH', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    return `${date}: ${cell.count ? `${cell.count} new shift record${cell.count === 1 ? '' : 's'} saved` : 'no new shift records saved'}`;
  }
  function render(shifts) {
    const host = document.getElementById('shift-activity-calendar');
    if (!host) return;
    const range = document.getElementById('activity-period');
    const data = build(shifts, new Date(), Number(range.value));
    const scroll = host.querySelector('.activity-scroll');
    const previousScroll = scroll?.scrollLeft;
    const selected = host.querySelector('.activity-day[aria-pressed="true"]')?.dataset.date;
    const previousFocus = host.contains(document.activeElement) ? document.activeElement.dataset.date : null;
    const months = [];
    let lastColumn = -4, lastMonth = '';
    for (const cell of data.cells) {
      if (!cell.available) continue;
      const month = cell.key.slice(0, 7);
      if (month !== lastMonth) {
        if (cell.column - lastColumn >= 3) {
          const name = new Date(cell.key + 'T12:00:00Z').toLocaleDateString('en-PH', { month: 'short', timeZone: 'UTC' });
          months.push(`<span style="grid-column:${cell.column + 1}">${name}</span>`);
          lastColumn = cell.column;
        }
        lastMonth = month;
      }
    }
    const current = data.cells.find(cell => cell.key === selected && cell.available) || data.cells.find(cell => cell.key === data.today);
    resizeObserver?.disconnect();
    host.innerHTML = `
      <div class="activity-summary"><strong>${data.activeDays} active logging day${data.activeDays === 1 ? '' : 's'}</strong><span>${data.total} new shift record${data.total === 1 ? '' : 's'} saved in the last ${data.days} days</span></div>
      <p class="activity-recency">${data.gap === null ? 'No dated shift saves yet. Save your first shift to start your activity calendar.' : data.gap === 0 ? 'You saved a new shift today.' : `Last new shift saved ${data.gap} day${data.gap === 1 ? '' : 's'} ago.`}</p>
      <div class="activity-calendar-layout">
        <div class="activity-weekdays" aria-hidden="true"><span>Mon</span><span>Wed</span><span>Fri</span></div>
        <div class="activity-scroll" role="region" aria-label="Shift saving activity calendar" tabindex="0" aria-describedby="activity-help">
          <div class="activity-matrix" style="--activity-weeks:${data.columns}">
            <div class="activity-months" aria-hidden="true">${months.join('')}</div>
            <div class="activity-days" role="group" aria-label="Daily shift saves; use arrow keys to explore">
              ${data.cells.map(cell => cell.available ? `<button type="button" class="activity-day activity-level-${cell.level}${cell.key === data.today ? ' is-today' : ''}" data-date="${cell.key}" data-count="${cell.count}" tabindex="${cell.key === current.key ? 0 : -1}" aria-pressed="${cell.key === current.key}" aria-label="${label(cell)}" title="${label(cell)}"><span class="sr-only">${cell.count}</span></button>` : '<span class="activity-padding" aria-hidden="true"></span>').join('')}
            </div>
          </div>
        </div>
      </div>
      <div class="activity-legend" aria-label="Color scale: 0, 1, 2, 3, or 4 or more shift records saved per day"><span>Saves per day</span>${[0, 1, 2, 3, 4].map(n => `<span class="activity-legend-item"><i class="activity-level-${n}" aria-hidden="true"></i>${n === 4 ? '4+' : n}</span>`).join('')}</div>
      <p id="activity-day-detail" class="activity-day-detail" role="status">${label(current)}</p>
      <p id="activity-help" class="activity-help">Select a square for details. Use arrow keys or scroll to explore earlier dates.</p>
      <p class="activity-note">Based on when your current shift records were first saved, in Manila time. Work dates, edits, and sign-ins do not add activity.${data.unknown ? ` ${data.unknown} record${data.unknown === 1 ? '' : 's'} without a valid save timestamp ${data.unknown === 1 ? 'is' : 'are'} excluded.` : ''}</p>`;
    const newScroll = host.querySelector('.activity-scroll');
    const firstVisibleRender = !host.dataset.visibleRender;
    newScroll.scrollLeft = firstVisibleRender ? newScroll.scrollWidth : previousScroll ?? newScroll.scrollWidth;
    let previousWidth = newScroll.clientWidth;
    let stickToEnd = firstVisibleRender || newScroll.scrollWidth - newScroll.clientWidth - newScroll.scrollLeft < 2;
    newScroll.addEventListener('scroll', () => {
      if (newScroll.clientWidth === previousWidth) stickToEnd = newScroll.scrollWidth - newScroll.clientWidth - newScroll.scrollLeft < 2;
    }, { passive: true });
    resizeObserver = new ResizeObserver(() => {
      if (stickToEnd) newScroll.scrollLeft = newScroll.scrollWidth;
      previousWidth = newScroll.clientWidth;
    });
    resizeObserver.observe(newScroll);
    if (firstVisibleRender) requestAnimationFrame(() => {
      // Startup temporarily hides the workspace while account data loads.
      if (newScroll.isConnected && newScroll.clientWidth > 0) {
        newScroll.scrollLeft = newScroll.scrollWidth;
        host.dataset.visibleRender = 'true';
      }
    });
    if (previousFocus) host.querySelector(`[data-date="${previousFocus}"]`)?.focus({ preventScroll: true });
    if (!host.dataset.bound) {
      host.dataset.bound = 'true';
      function choose(button, focus = false) {
        host.querySelectorAll('.activity-day').forEach(cell => { cell.tabIndex = cell === button ? 0 : -1; cell.setAttribute('aria-pressed', String(cell === button)); });
        document.getElementById('activity-day-detail').textContent = label({ key: button.dataset.date, count: Number(button.dataset.count) });
        if (focus) { button.focus({ preventScroll: true }); button.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' }); }
      }
      host.addEventListener('click', event => { const button = event.target.closest('.activity-day'); if (button) choose(button); });
      host.addEventListener('keydown', event => {
        const button = event.target.closest('.activity-day');
        if (!button) return;
        const cells = [...host.querySelectorAll('.activity-day')], index = cells.indexOf(button);
        const steps = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 };
        let target;
        if (Object.hasOwn(steps, event.key)) target = Math.max(0, Math.min(cells.length - 1, index + steps[event.key]));
        else if (event.key === 'Home') target = 0;
        else if (event.key === 'End') target = cells.length - 1;
        else return;
        event.preventDefault(); choose(cells[target], true);
      });
      range.addEventListener('change', () => { render(allShifts); const region = host.querySelector('.activity-scroll'); region.scrollLeft = region.scrollWidth; });
    }
  }
  return { build, dateKey, render };
})();
if (typeof module !== 'undefined') module.exports = ShiftActivity;
