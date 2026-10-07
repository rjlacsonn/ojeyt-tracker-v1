/* ============================================================
   APP - OJeyT Tracker (Supabase Edition)
   ============================================================ */

let currentUser = null;
let allShifts = [];
let currentPage = 'login';
let editingShiftId = null;

const RING_CIRCUMFERENCE = 364.42;

// === NAVIGATION ===
function navTo(page) {
  if (!AccountAccess.canVisit(currentUser, page)) page = AccountAccess.home(currentUser);
  // === CONFIRM BEFORE LEAVING IF FORM IS DIRTY ===
  if (shiftFormDirty && currentPage === 'dashboard' && page !== 'dashboard') {
    confirmLeave(() => navTo(page));
    return;
  }

  const wasInWorkspace = Boolean(document.activeElement?.closest('#main-content-container, #topbar-container'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const targetPage = document.getElementById(`page-${page}`);
  if (targetPage) targetPage.classList.add('active');

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('active');
    btn.removeAttribute('aria-current');
  });
  const navBtn = document.querySelector(`.nav-btn[data-page="${page}"]`);
  if (navBtn) {
    navBtn.classList.add('active');
    navBtn.setAttribute('aria-current', 'page');
  }

  currentPage = page;
  if (page === 'dashboard') {
    updateDashboard();
    setDefaultShiftDate();
  }
  if (page === 'history') renderHistoryPage();
  if (page === 'documents') Documents.open();
  if (page === 'document-review') Documents.openReview();
  if (page === 'badges') renderGamification();
  if (page === 'settings') renderSettingsPage();
  if (page === 'professor-home') renderProfessorStatus();
  if (page === 'student-home') Enrollment.openStudent();
  if (page === 'student-approvals') Enrollment.openProfessor();
  if (page === 'account-unavailable') renderAccountUnavailable();
  // Move keyboard and screen-reader focus into the newly opened page.
  const heading = targetPage?.querySelector('h1');
  if (heading && wasInWorkspace) {
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }
  window.scrollTo({ top: 0, behavior: 'instant' });
}

// === TOAST ===
function showToast(message) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

function setFormError(id, message = '') {
  const errorEl = document.getElementById(id);
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.classList.toggle('is-visible', Boolean(message));
}

function clearAuthErrors() {
  setFormError('login-error');
  setFormError('signup-error');
  setFormError('professor-signup-error');
  const info = document.getElementById('login-info');
  if (info) info.style.display = 'none';
}

function setButtonLoading(button, isLoading, loadingText) {
  if (!button) return;
  button.disabled = isLoading;
  button.classList.toggle('is-loading', isLoading);
  if (isLoading) {
    button.dataset.loadingHtml = button.innerHTML;
    button.textContent = loadingText;
  } else {
    button.innerHTML = button.dataset.loadingHtml || button.innerHTML;
    delete button.dataset.loadingHtml;
  }
}

function truncateEmail(email) {
  if (!email) return '';
  return email.length > 18 ? `${email.slice(0, 14)}...` : email;
}

function getFirstName(fullName) {
  return (fullName || 'User').trim().split(/\s+/)[0];
}

// === SHOW/HIDE APP ===
function showAuthUI(target = 'login') {
  document.getElementById('topbar-container').style.display = 'none';
  document.getElementById('main-content-container').style.display = 'none';
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const targetPage = document.getElementById(`page-${target}`);
  if (targetPage) targetPage.classList.add('active');
  currentPage = target;
}

async function showAppUI() {
  if (!currentUser) { showAuthUI('login'); return; }
  document.getElementById('topbar-container').style.display = '';
  document.getElementById('main-content-container').style.display = '';
  const emailEl = document.getElementById('user-email-short');
  if (emailEl) emailEl.textContent = truncateEmail(currentUser?.email || '');

  // ===== LOAD PROFILE PICTURE FROM SUPABASE =====
  if (currentUser?.id) {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('profile_picture_url')
        .eq('id', currentUser.id)
        .single();
      
      if (profile?.profile_picture_url) {
        currentUser.profilePictureUrl = profile.profile_picture_url;
      }
    } catch (err) {
      console.error('Error loading profile picture:', err);
    }
  }

  // ===== SET AVATAR =====
  updateAvatarDisplay();

  // Document permissions are loaded separately from the student's attendance data.
  Enrollment.reset();
  if (currentUser.accountType === 'unavailable' || currentUser.accountStatus !== 'active') Documents.reset();
  else await Documents.initializeAccount();
  applyAccountNavigation();

  // ===== SHOW PROGRESS BAR =====
  const barWrap = document.getElementById('ojt-progress-bar-wrap');
  if (barWrap) barWrap.style.display = currentUser.accountType === 'student' && currentUser.accountStatus === 'active' ? '' : 'none';
  navTo(AccountAccess.home(currentUser));
}

function applyAccountNavigation() {
  document.querySelectorAll('.nav-btn').forEach(button => {
    button.hidden = !AccountAccess.canVisit(currentUser, button.dataset.page);
  });
  const role = document.getElementById('account-role-label');
  if (role) role.textContent = currentUser.accountType === 'professor'
    ? 'Professor'
    : currentUser.accountType === 'student' ? `Student${currentUser.accountStatus === 'pending' ? ' · Pending approval' : ''}` : 'Access unavailable';
  const hours = document.getElementById('student-hours-settings');
  if (hours) hours.hidden = currentUser.accountType !== 'student';
}

function renderProfessorStatus() {
  document.getElementById('professor-status-heading').textContent = 'Your professor account is active';
  document.getElementById('professor-status-message').textContent = 'Open Students to share your coordinator code and approve student accounts. Use Review to check their document submissions.';
  document.getElementById('professor-status-institution').textContent = [currentUser?.institution, currentUser?.department].filter(Boolean).join(' · ');
}

function renderAccountUnavailable() {
  const issue = currentUser?.accountAccessIssue || AccountAccess.describeError();
  document.getElementById('account-unavailable-heading').textContent = issue.title;
  document.getElementById('account-unavailable-message').textContent = issue.message;
}

async function refreshAccountAccess(event) {
  const button = event.currentTarget;
  setButtonLoading(button, true, 'Checking...');
  try {
    await loadUserData();
    await showAppUI();
    if (currentUser?.accountType === 'professor') showToast('Your professor account is active.');
  } catch (error) {
    console.error('Account refresh:', error);
    showToast('Could not check account access. Please try again.');
  } finally { setButtonLoading(button, false); }
}

// === LOGOUT ===
async function logout() {
  Enrollment.reset();
  Documents.reset();
  await auth.logout();
  currentUser = null;
  allShifts = [];
  resetGamification();
  markFormClean();
  editingShiftId = null;

  // ===== HIDE PROGRESS BAR ON LOGOUT =====
  const barWrap = document.getElementById('ojt-progress-bar-wrap');
  if (barWrap) barWrap.style.display = 'none';
  const barFill = document.getElementById('ojt-progress-bar-fill');
  if (barFill) barFill.style.width = '0%';

  showAuthUI('login');
  showToast('Logged out');
}

// === LOAD DATA ===
async function loadUserData() {
  const user = await auth.refreshUser();
  if (!user) {
    currentUser = null;
    return;
  }
  currentUser = user;

  // ===== LOAD PROFILE FROM SUPABASE =====
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (profile) {
    currentUser.fullName = profile.full_name;
    currentUser.requiredHours = profile.required_hours ?? null;
  } else {
    currentUser.fullName = user.user_metadata?.full_name || '';
    currentUser.requiredHours = null;
  }

  try {
    Object.assign(currentUser, await AccountAccess.load(supabase));
    delete currentUser.accountAccessIssue;
  } catch (error) {
    console.error('Account access:', error);
    currentUser.accountType = 'unavailable';
    currentUser.accountStatus = 'unavailable';
    currentUser.accountAccessIssue = AccountAccess.describeError(error);
  }
  allShifts = [];
  if (currentUser.accountType === 'student' && currentUser.accountStatus === 'active') {
    await loadAllShifts();
    updateDashboard();
  }
}

// === SHIFTS (SUPABASE) ===
async function loadAllShifts() {
  if (!currentUser) return;
  const { data, error } = await supabase
    .from('shifts')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('date', { ascending: false });

  if (error) {
    console.error('Load shifts error:', error);
    allShifts = [];
  } else {
    allShifts = data || [];
  }
}

// === SHIFT FORM ===
function setDefaultShiftDate() {
  const dateInput = document.getElementById('shift-date');
  if (dateInput) {
    dateInput.value = Gamification.dateKey();
    dateInput.max = Gamification.dateKey();
  }
}

function calculateDuration(startTime, endTime) {
  if (!startTime || !endTime) return 0;
  const cleanStart = String(startTime).slice(0, 5);
  const cleanEnd = String(endTime).slice(0, 5);
  const start = new Date(`1970-01-01T${cleanStart}:00`);
  const end = new Date(`1970-01-01T${cleanEnd}:00`);
  if (isNaN(start) || isNaN(end) || end <= start) return 0;
  return (end - start) / (1000 * 60 * 60);
}

function updateShiftDurations() {
  const morningIn = String(document.getElementById('morning-in')?.value || '').slice(0, 5);
  const morningOut = String(document.getElementById('morning-out')?.value || '').slice(0, 5);
  const afternoonIn = String(document.getElementById('afternoon-in')?.value || '').slice(0, 5);
  const afternoonOut = String(document.getElementById('afternoon-out')?.value || '').slice(0, 5);
  const overtimeStart = String(document.getElementById('overtime-start')?.value || '').slice(0, 5);
  const overtimeEnd = String(document.getElementById('overtime-end')?.value || '').slice(0, 5);

  const morningDuration = calculateDuration(morningIn, morningOut);
  const afternoonDuration = calculateDuration(afternoonIn, afternoonOut);
  const overtimeDuration = calculateDuration(overtimeStart, overtimeEnd);
  const totalDuration = morningDuration + afternoonDuration + overtimeDuration;

  const morningEl = document.getElementById('morning-duration');
  const afternoonEl = document.getElementById('afternoon-duration');
  const overtimeEl = document.getElementById('overtime-duration');
  const totalEl = document.getElementById('total-duration');

  if (morningEl) morningEl.textContent = `${morningDuration.toFixed(2)} hrs`;
  if (afternoonEl) afternoonEl.textContent = `${afternoonDuration.toFixed(2)} hrs`;
  if (overtimeEl) overtimeEl.textContent = `${overtimeDuration.toFixed(2)} hrs`;
  if (totalEl) totalEl.textContent = `${totalDuration.toFixed(2)} hours`;
}

async function saveShift() {
  const date = document.getElementById('shift-date')?.value;
  const morningIn = String(document.getElementById('morning-in')?.value || '').slice(0, 5);
  const morningOut = String(document.getElementById('morning-out')?.value || '').slice(0, 5);

  if (!date || !morningIn || !morningOut) {
    showToast('Please fill in date, morning clock-in, and clock-out times');
    return;
  }

  // === DUPLICATE PROTECTION ===
  {
    const duplicate = allShifts.find(s => s.date === date && s.id !== editingShiftId);
    if (duplicate) {
      showToast(`❌ A shift already exists for ${new Date(date + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}. Edit the existing shift instead.`);
      return;
    }
  }

  const afternoonIn = String(document.getElementById('afternoon-in')?.value || '').slice(0, 5) || null;
  const afternoonOut = String(document.getElementById('afternoon-out')?.value || '').slice(0, 5) || null;
  const overtimeStart = String(document.getElementById('overtime-start')?.value || '').slice(0, 5) || null;
  const overtimeEnd = String(document.getElementById('overtime-end')?.value || '').slice(0, 5) || null;

  const morningHours = calculateDuration(morningIn, morningOut);
  const afternoonHours = calculateDuration(afternoonIn, afternoonOut);
  const overtimeHours = calculateDuration(overtimeStart, overtimeEnd);
  const totalHours = morningHours + afternoonHours + overtimeHours;

  const pairs = [[morningIn, morningOut], [afternoonIn, afternoonOut], [overtimeStart, overtimeEnd]];
  if (date > Gamification.dateKey() || pairs.some(([start, end]) =>
    Boolean(start) !== Boolean(end) || (start && calculateDuration(start, end) <= 0))) {
    showToast('Use today or an earlier date, and enter a clock-out after each clock-in.');
    return;
  }
  const intervals = pairs.filter(([start, end]) => start && end).sort((a, b) => a[0].localeCompare(b[0]));
  if (intervals.some((pair, index) => index > 0 && pair[0] < intervals[index - 1][1])) {
    showToast('Session times must not overlap.');
    return;
  }

  const shiftPayload = {
    date: date,
    morning_in: morningIn,
    morning_out: morningOut,
    afternoon_in: afternoonIn || null,
    afternoon_out: afternoonOut || null,
    overtime_start: overtimeStart || null,
    overtime_end: overtimeEnd || null,
    total_hours: totalHours,
    notes: document.getElementById('shift-notes')?.value.trim() || null
  };

  let saveError;

  if (editingShiftId) {
    const { data, error } = await supabase
      .from('shifts')
      .update(shiftPayload)
      .eq('id', editingShiftId)
      .eq('user_id', currentUser.id)
      .select();

    saveError = error;

  } else {

    const { data, error } = await supabase
      .from('shifts')
      .insert({ ...shiftPayload, user_id: currentUser.id })
      .select();

    saveError = error;
  }

  if (saveError) {
    showToast('Failed to save shift: ' + saveError.message);
    console.error('Save error:', saveError);
    return;
  }

  editingShiftId = null;
  showToast(`✅ Shift saved — ${totalHours.toFixed(2)} hrs logged`);
  document.getElementById('shift-form')?.reset();
  markFormClean();

  const saveBtn = document.getElementById('save-shift-btn');
  if (saveBtn) saveBtn.textContent = 'Save Shift';

  setDefaultShiftDate();
  updateShiftDurations();

  // ===== LOAD SHIFTS THEN REFRESH DASHBOARD =====
  await loadAllShifts();
  updateDashboard(true);
}

// === CALCULATE ESTIMATED FINISH DATE ===
// Always uses the EARLIEST shift date as the start, and the hours
// logged on that earliest day as the daily rate. Recalculates any
// time shifts change, so editing/adding an earlier date updates it.
function calculateEstimatedFinish() {
  if (!currentUser || !(currentUser.requiredHours > 0) || !allShifts.length) return null;

  // ===== FIND THE EARLIEST SHIFT DATE ACROSS ALL LOGGED SHIFTS =====
  const firstShiftDateStr = allShifts.reduce((earliest, shift) =>
    shift.date < earliest ? shift.date : earliest,
    allShifts[0].date
  );

  // ===== USE THE HOURS LOGGED ON THAT EARLIEST DAY AS DAILY RATE =====
  const firstShift = allShifts.find(s => s.date === firstShiftDateStr);
  const firstDayHours = firstShift?.total_hours || 8;

  const requiredHours = currentUser.requiredHours;
  const workdaysNeeded = Math.ceil(requiredHours / firstDayHours);

  // ===== PH PUBLIC HOLIDAYS =====
  const allHolidays = OJT_HOLIDAYS;

  // ===== COUNT WORKDAYS FORWARD FROM THE EARLIEST SHIFT DATE =====
  const finishDate = new Date(firstShiftDateStr + 'T00:00:00');
  finishDate.setHours(0, 0, 0, 0);
  let daysAdded = 0;

  while (daysAdded < workdaysNeeded) {
    finishDate.setDate(finishDate.getDate() + 1);
    const dow = finishDate.getDay();
    const y = finishDate.getFullYear();
    const m = String(finishDate.getMonth() + 1).padStart(2, '0');
    const d = String(finishDate.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;
    if (dow !== 0 && dow !== 6 && !allHolidays.has(dateStr)) {
      daysAdded++;
    }
  }

  return finishDate;
}

// === SHIFT HISTORY TABLE ===
function renderShiftHistory() {
  const container = document.getElementById('shift-history-body');
  if (!container) return;

  const filterDate = document.getElementById('shift-filter-date')?.value;
  let shiftsToShow = [...allShifts];

  if (filterDate) {
    shiftsToShow = shiftsToShow.filter(shift => shift.date === filterDate);
  }

  shiftsToShow.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (!shiftsToShow.length) {
    container.innerHTML = filterDate
      ? '<div class="empty-state"><strong>No shifts on this date</strong><p>Choose another date or clear the filter to see all your shifts.</p><button type="button" class="text-link" onclick="document.getElementById(\'shift-filter-date\').value = \'\'; renderShiftHistory()">Clear date filter</button></div>'
      : '<div class="empty-state"><strong>Your first shift starts here</strong><p>Save your working hours using the shift form. Your records will appear here.</p><a class="text-link" href="#shift-date">Log your first shift →</a></div>';
    return;
  }

  // ===== HELPER: FORMAT TIME FROM HH:MM:SS TO HH:MM AM/PM =====
  function formatTime(t) {
    if (!t) return null;
    const clean = String(t).slice(0, 5);
    const [h, m] = clean.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return null;
    const period = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    return `${hour}:${String(m).padStart(2, '0')} ${period}`;
  }

  // ===== HELPER: CALCULATE DURATION FROM SUPABASE TIME =====
  function calcHrs(start, end) {
    if (!start || !end) return null;
    const s = String(start).slice(0, 5);
    const e = String(end).slice(0, 5);
    const startD = new Date(`1970-01-01T${s}:00`);
    const endD = new Date(`1970-01-01T${e}:00`);
    if (isNaN(startD) || isNaN(endD) || endD <= startD) return null;
    return ((endD - startD) / (1000 * 60 * 60)).toFixed(2);
  }

  container.innerHTML = shiftsToShow.map(shift => {
    const morningHrs = calcHrs(shift.morning_in, shift.morning_out);
    const afternoonHrs = calcHrs(shift.afternoon_in, shift.afternoon_out);
    const overtimeHrs = calcHrs(shift.overtime_start, shift.overtime_end);

    const morningDisplay = morningHrs
      ? `${formatTime(shift.morning_in)} - ${formatTime(shift.morning_out)}<br><small>(${morningHrs} hrs)</small>`
      : '—';

    const afternoonDisplay = afternoonHrs
      ? `${formatTime(shift.afternoon_in)} - ${formatTime(shift.afternoon_out)}<br><small>(${afternoonHrs} hrs)</small>`
      : '—';

    const overtimeDisplay = overtimeHrs
      ? `${formatTime(shift.overtime_start)} - ${formatTime(shift.overtime_end)}<br><small>(${overtimeHrs} hrs)</small>`
      : '—';

    return `
      <div class="shift-row">
        <div class="shift-date">${new Date(shift.date + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</div>
        <div class="time-range"><span class="session-label">Morning</span>${morningDisplay}</div>
        <div class="time-range"><span class="session-label">Afternoon</span>${afternoonDisplay}</div>
        <div class="time-range"><span class="session-label">Overtime</span>${overtimeDisplay}</div>
        <div class="total-hours"><strong>${(shift.total_hours || 0).toFixed(2)} hrs</strong></div>
        ${shift.notes ? `<div class="shift-note-display">${escapeShiftNote(shift.notes)}</div>` : ''}
        <div class="shift-actions">
          <button class="secondary-btn small-btn" onclick="editShift('${shift.id}')">Edit</button>
          <button class="secondary-btn small-btn danger-btn" onclick="deleteShift('${shift.id}')">Delete</button>
        </div>
      </div>
    `;
  }).join('');
}

function escapeShiftNote(value) {
  const text = document.createElement('span');
  text.textContent = value;
  return text.innerHTML;
}

async function editShift(shiftId) {
  const shift = allShifts.find(s => s.id === shiftId);
  if (!shift) return;

  editingShiftId = shiftId;

  // ===== STRIP SECONDS FROM SUPABASE TIME FORMAT =====
  document.getElementById('shift-date').value = shift.date || '';
  document.getElementById('morning-in').value = String(shift.morning_in || '').slice(0, 5);
  document.getElementById('morning-out').value = String(shift.morning_out || '').slice(0, 5);
  document.getElementById('afternoon-in').value = String(shift.afternoon_in || '').slice(0, 5);
  document.getElementById('afternoon-out').value = String(shift.afternoon_out || '').slice(0, 5);
  document.getElementById('overtime-start').value = String(shift.overtime_start || '').slice(0, 5);
  document.getElementById('overtime-end').value = String(shift.overtime_end || '').slice(0, 5);
  document.getElementById('shift-notes').value = shift.notes || '';
  

  // ===== WAIT FOR DOM THEN RECALCULATE =====
  setTimeout(() => updateShiftDurations(), 100);

  const saveBtn = document.getElementById('save-shift-btn');
  if (saveBtn) saveBtn.textContent = 'Update Shift';

  document.getElementById('shift-form')?.scrollIntoView({ behavior: 'smooth' });
  showToast('Shift loaded — make your changes and click Update Shift');
}

async function deleteShift(shiftId) {
  if (!confirm('Delete this shift record? This cannot be undone.')) return;

  const { error } = await supabase
    .from('shifts')
    .delete()
    .eq('id', shiftId);

  if (error) {
    showToast('Failed to delete shift: ' + error.message);
    return;
  }

  showToast('Shift deleted');
  await loadAllShifts();
  updateDashboard();
}

// === DAILY AVERAGE VS TARGET INDICATOR ===
function updateAvgTargetIndicator(totalHours, uniqueDays, requiredHours) {
  const row = document.getElementById('avg-target-row');
  if (!row) return;

  if (!(requiredHours > 0) || uniqueDays < 1 || totalHours <= 0) {
    row.style.display = 'none';
    return;
  }

  row.style.display = '';

  const avgDaily = totalHours / uniqueDays;

  // ===== CALCULATE TARGET DAILY HOURS NEEDED =====
  // Based on remaining hours and remaining workdays from today
  const now = new Date();
  const allHolidays = OJT_HOLIDAYS;

  // ===== COUNT REMAINING WORKDAYS FROM TODAY =====
  const finishDate = calculateEstimatedFinish();
  let remainingWorkdays = 0;
  if (finishDate) {
    let cursor = new Date(now);
    cursor.setHours(0, 0, 0, 0);
    while (cursor <= finishDate) {
      cursor.setDate(cursor.getDate() + 1);
      const dow = cursor.getDay();
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, '0');
      const d = String(cursor.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;
      if (dow !== 0 && dow !== 6 && !allHolidays.has(dateStr)) {
        remainingWorkdays++;
      }
    }
  }

  const remainingHours = Math.max(0, requiredHours - totalHours);
  const targetDaily = remainingWorkdays > 0
    ? remainingHours / remainingWorkdays
    : avgDaily;

  // ===== UPDATE LABELS =====
  const avgDisplay = document.getElementById('avg-daily-display');
  const targetDisplay = document.getElementById('target-daily-display');
  const fill = document.getElementById('avg-target-fill');
  const marker = document.getElementById('avg-target-marker');
  const status = document.getElementById('avg-target-status');

  if (avgDisplay) avgDisplay.textContent = `${avgDaily.toFixed(1)}h`;
  if (targetDisplay) targetDisplay.textContent = `${targetDaily.toFixed(1)}h`;

  // ===== CALCULATE BAR WIDTH =====
  const maxVal = Math.max(avgDaily, targetDaily, 8);
  const avgPct = Math.min((avgDaily / maxVal) * 100, 100);
  const targetPct = Math.min((targetDaily / maxVal) * 100, 100);

  if (fill) fill.style.width = `${avgPct}%`;
  if (marker) marker.style.left = `${targetPct}%`;

  // ===== STATUS MESSAGE =====
  if (status) {
    if (avgDaily >= targetDaily) {
      fill.classList.remove('behind');
      fill.classList.add('on-track');
      status.textContent = `✅ On track — you're averaging ${avgDaily.toFixed(1)}h/day`;
      status.className = 'avg-target-status status-good';
    } else {
      const diff = (targetDaily - avgDaily).toFixed(1);
      fill.classList.remove('on-track');
      fill.classList.add('behind');
      status.textContent = `⚠️ Need ${diff}h more per day to finish on time`;
      status.className = 'avg-target-status status-warn';
    }
  }
}

// === DASHBOARD ===
function updateDashboard(celebrateRewards = false) {
  if (!currentUser || currentUser.accountType !== 'student' || currentUser.accountStatus !== 'active') return;

  const totalHours = allShifts.reduce((sum, shift) => sum + (shift.total_hours || 0), 0);
  const requiredHours = currentUser.requiredHours;
  const remainingHours = requiredHours > 0 ? Math.max(0, requiredHours - totalHours) : null;
  const percentage = requiredHours > 0
    ? Math.min(Math.round((totalHours / requiredHours) * 100), 100)
    : 0;
  const uniqueDays = new Set(allShifts.map(s => s.date)).size;

  const greetingEl = document.getElementById('greeting-msg');
  const percentEl = document.getElementById('progress-percent');
  const hoursRenderedEl = document.getElementById('hours-rendered');
  const remainingEl = document.getElementById('hours-remaining');
  const daysEl = document.getElementById('stat-total-days');
  const totalHoursEl = document.getElementById('stat-total-hours');
  const ringEl = document.getElementById('progress-circle-fill');
  const estimateEl = document.getElementById('estimated-finish');

  if (greetingEl) greetingEl.textContent = `Hello, ${getFirstName(currentUser.fullName)}`;
  if (percentEl) percentEl.textContent = requiredHours > 0 ? `${percentage}%` : 'Not assigned';
  if (hoursRenderedEl) hoursRenderedEl.textContent = requiredHours > 0 ? `${totalHours.toFixed(1)} / ${requiredHours} hrs` : `${totalHours.toFixed(1)} hrs logged`;
  if (remainingEl) remainingEl.textContent = remainingHours === null ? 'Not assigned' : `${remainingHours.toFixed(0)}h`;
  if (daysEl) daysEl.textContent = uniqueDays;
  if (totalHoursEl) totalHoursEl.textContent = `${totalHours.toFixed(0)}h`;

  if (ringEl) {
    const offset = RING_CIRCUMFERENCE - (percentage / 100) * RING_CIRCUMFERENCE;
    ringEl.style.strokeDashoffset = offset;
  }

  // ===== UPDATE TOP PROGRESS BAR =====
  const barFill = document.getElementById('ojt-progress-bar-fill');
  if (barFill) barFill.style.width = `${percentage}%`;

  // ===== ESTIMATED FINISH — ALWAYS BASED ON EARLIEST SHIFT DATE =====
  if (estimateEl) {
    if (remainingHours === null) {
      estimateEl.textContent = 'Your professor or OJT coordinator has not assigned your required hours yet.';
    } else if (remainingHours <= 0) {
      estimateEl.textContent = 'Target reached — great work!';
    } else if (!allShifts.length) {
      estimateEl.textContent = 'Log your first shift to see your estimated finish date.';
    } else {
      const finishDate = calculateEstimatedFinish();
      if (finishDate) {
        estimateEl.textContent = finishDate.toLocaleDateString([], {
          month: 'short', day: 'numeric', year: 'numeric'
        });
      }
    }
  }

  // === UPDATE STREAK === / === DAILY AVG VS TARGET ===
  updateAvgTargetIndicator(totalHours, uniqueDays, requiredHours);
  const streak = calculateStreak();
  const streakEl = document.getElementById('streak-count');
  const streakBestEl = document.getElementById('streak-best');
  if (streakEl) {
    streakEl.textContent = streak.current;
    streakEl.classList.toggle('zero-streak', streak.current === 0);
  }
  if (streakBestEl) streakBestEl.textContent = streak.best;

  // ===== REFRESH WHICHEVER CHART IS ACTIVE =====
  const monthlyVisible = document.getElementById('monthly-hours-chart')?.style.display !== 'none';
  if (monthlyVisible) {
    renderMonthlyChart();
  } else {
    renderWeeklyChart();
  }
  renderShiftHistory();
  renderGamification(celebrateRewards);
}

// === STREAK COUNTER ===
function calculateStreak() {
  return Gamification.calculate(allShifts, currentUser?.requiredHours, new Date(), OJT_HOLIDAYS).streak;
}

// === CHART TOGGLE ===
function switchChart(type) {
  const weeklyChart = document.getElementById('weekly-hours-chart');
  const monthlyChart = document.getElementById('monthly-hours-chart');
  const weeklyBtn = document.getElementById('btn-weekly-chart');
  const monthlyBtn = document.getElementById('btn-monthly-chart');
  weeklyBtn.setAttribute('aria-pressed', String(type === 'weekly'));
  monthlyBtn.setAttribute('aria-pressed', String(type === 'monthly'));

  if (type === 'weekly') {
    weeklyChart.style.display = '';
    monthlyChart.style.display = 'none';
    weeklyBtn.classList.add('active');
    monthlyBtn.classList.remove('active');
    renderWeeklyChart();
  } else {
    weeklyChart.style.display = 'none';
    monthlyChart.style.display = '';
    weeklyBtn.classList.remove('active');
    monthlyBtn.classList.add('active');
    renderMonthlyChart();
  }
}

// === WEEKLY CHART ===
function renderWeeklyChart() {
  const container = document.getElementById('weekly-hours-chart');
  if (!container) return;

  const today = new Date();
  const dayIndex = (today.getDay() + 6) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - dayIndex);
  monday.setHours(0, 0, 0, 0);

  const week = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    // ===== USE LOCAL DATE STRING TO AVOID TIMEZONE ISSUES =====
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return {
      label: date.toLocaleDateString([], { weekday: 'short' }),
      dateStr: `${y}-${m}-${d}`,
      hours: 0
    };
  });

  allShifts.forEach(shift => {
    const shiftDate = String(shift.date).slice(0, 10);
    const day = week.find(d => d.dateStr === shiftDate);
    if (day) day.hours += parseFloat(shift.total_hours) || 0;
  });

  const maxHours = Math.max(...week.map(d => d.hours), 1);

  container.innerHTML = week.map(day => `
    <div class="chart-row">
      <span class="chart-label">${day.label}</span>
      <div class="chart-bar">
        <div class="chart-fill" style="width:${Math.round((day.hours / maxHours) * 100)}%"></div>
      </div>
      <span class="chart-value">${day.hours.toFixed(1)}h</span>
    </div>
  `).join('');
}

// === MONTHLY HOURS BAR CHART ===
function renderMonthlyChart() {
  const container = document.getElementById('monthly-hours-chart');
  if (!container) return;

  // ===== GET CURRENT MONTH DAYS =====
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // ===== BUILD DAYS ARRAY =====
  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1;
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return { day: d, dateStr, hours: 0 };
  });

  // ===== MATCH SHIFTS TO DAYS =====
  allShifts.forEach(shift => {
    const shiftDate = String(shift.date).slice(0, 10);
    const day = days.find(d => d.dateStr === shiftDate);
    if (day) day.hours += parseFloat(shift.total_hours) || 0;
  });

  const maxHours = Math.max(...days.map(d => d.hours), 1);
  const todayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // ===== RENDER BARS =====
  container.innerHTML = `
    <div class="monthly-chart-wrap">
      <div class="monthly-bars">
        ${days.map(day => {
          const heightPct = Math.round((day.hours / maxHours) * 100);
          const isToday = day.dateStr === todayStr;
          const isWeekend = new Date(day.dateStr + 'T00:00:00').getDay() === 0 ||
                            new Date(day.dateStr + 'T00:00:00').getDay() === 6;
          return `
            <div class="monthly-bar-col ${isToday ? 'is-today' : ''} ${isWeekend ? 'is-weekend' : ''}" role="img" aria-label="${day.dateStr}: ${day.hours.toFixed(1)} hours${isToday ? ', today' : ''}">
              <div class="monthly-bar-wrap">
                <div class="monthly-bar-fill" style="height:${heightPct}%;"
                  title="${day.dateStr}: ${day.hours.toFixed(1)}h"></div>
              </div>
              <span class="monthly-bar-label">${day.day}</span>
            </div>
          `;
        }).join('')}
      </div>
      <div class="monthly-chart-footer">
        <span>Total this month: <strong>${days.reduce((s, d) => s + d.hours, 0).toFixed(1)}h</strong></span>
        <span>Days logged: <strong>${days.filter(d => d.hours > 0).length}</strong></span>
      </div>
    </div>
  `;
}

// === LATE & ABSENCE TRACKER ===
function calculateShortDays(targetHoursPerDay = 8) {
  if (!allShifts.length) return 0;
  return allShifts.filter(s => (s.total_hours || 0) < targetHoursPerDay).length;
}

// === HISTORY VIEW TOGGLE ===
function switchHistoryView(type) {
  const dailyView = document.getElementById('all-sessions');
  const monthlyView = document.getElementById('monthly-summary');
  const dailyBtn = document.getElementById('btn-daily-view');
  const monthlyBtn = document.getElementById('btn-monthly-view');
  dailyBtn.setAttribute('aria-pressed', String(type === 'daily'));
  monthlyBtn.setAttribute('aria-pressed', String(type === 'monthly'));

  if (type === 'daily') {
    dailyView.style.display = '';
    monthlyView.style.display = 'none';
    dailyBtn.classList.add('active');
    monthlyBtn.classList.remove('active');
  } else {
    dailyView.style.display = 'none';
    monthlyView.style.display = '';
    dailyBtn.classList.remove('active');
    monthlyBtn.classList.add('active');
    renderMonthlySummary();
  }
}

// === MONTHLY SUMMARY RENDERER ===
function renderMonthlySummary() {
  const container = document.getElementById('monthly-summary');
  if (!container) return;

  if (!allShifts.length) {
    container.innerHTML = '<p class="empty-state">No shifts found.</p>';
    return;
  }

  // ===== GROUP SHIFTS BY MONTH =====
  const monthGroups = allShifts.reduce((acc, shift) => {
    const date = new Date(shift.date + 'T00:00:00');
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const label = date.toLocaleDateString([], { month: 'long', year: 'numeric' });
    if (!acc[key]) acc[key] = { label, shifts: [], totalHours: 0, days: 0 };
    acc[key].shifts.push(shift);
    acc[key].totalHours += parseFloat(shift.total_hours) || 0;
    acc[key].days++;
    return acc;
  }, {});

  // ===== SORT NEWEST FIRST =====
  const sorted = Object.entries(monthGroups).sort((a, b) => b[0].localeCompare(a[0]));

  const requiredHours = currentUser?.requiredHours;

  container.innerHTML = sorted.map(([key, data]) => {
    const avgPerDay = data.days > 0 ? (data.totalHours / data.days).toFixed(1) : 0;
    const pct = requiredHours > 0 ? Math.min(Math.round((data.totalHours / requiredHours) * 100), 100) : 0;
    const shortDays = data.shifts.filter(s => (s.total_hours || 0) < 8).length;

    return `
      <div class="monthly-summary-card">
        <div class="monthly-summary-header">
          <h3 class="monthly-summary-title">${data.label}</h3>
          <span class="monthly-summary-total">${data.totalHours.toFixed(1)}h</span>
        </div>
        <div class="monthly-summary-bar-track">
          <div class="monthly-summary-bar-fill" style="width:${pct}%"></div>
        </div>
        <div class="monthly-summary-stats">
          <span>📅 <strong>${data.days}</strong> days worked</span>
          <span>⏱ <strong>${avgPerDay}h</strong> avg/day</span>
          ${shortDays > 0 ? `<span class="short-days-badge">⚠️ ${shortDays} short day${shortDays > 1 ? 's' : ''}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// === HISTORY PAGE ===
function renderHistoryPage() {
  const totalHours = allShifts.reduce((sum, s) => sum + (s.total_hours || 0), 0);
  const uniqueDays = new Set(allShifts.map(s => s.date)).size;
  const avgHours = uniqueDays ? totalHours / uniqueDays : 0;

  const daysEl = document.getElementById('history-days');
  const hoursEl = document.getElementById('history-hours');
  const avgEl = document.getElementById('history-average');
  const activeEl = document.getElementById('history-active');

  if (daysEl) daysEl.textContent = uniqueDays;
  if (hoursEl) hoursEl.textContent = `${totalHours.toFixed(1)}h`;
  if (avgEl) avgEl.textContent = `${avgHours.toFixed(1)}h`;
  if (activeEl) activeEl.textContent = '0';

  // === LATE & ABSENCE TRACKER ===
  const avgHoursPerDay = uniqueDays > 0 ? totalHours / uniqueDays : 8;
  const shortDays = calculateShortDays(avgHoursPerDay);
  const shortDaysEl = document.getElementById('history-short-days');
  if (shortDaysEl) shortDaysEl.textContent = shortDays;

  const container = document.getElementById('all-sessions');
  if (!container) return;

  if (!allShifts.length) {
    container.innerHTML = '<p class="empty-state">No shifts found.</p>';
    return;
  }

  // ===== HELPER: FORMAT TIME HH:MM:SS → H:MM AM/PM =====
  function fmtTime(t) {
    if (!t) return '--';
    const clean = String(t).slice(0, 5);
    const [h, m] = clean.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return '--';
    const period = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    return `${hour}:${String(m).padStart(2, '0')} ${period}`;
  }

  // ===== HELPER: CALCULATE DURATION =====
  function calcHrs(start, end) {
    if (!start || !end) return null;
    const s = new Date(`1970-01-01T${String(start).slice(0,5)}:00`);
    const e = new Date(`1970-01-01T${String(end).slice(0,5)}:00`);
    if (isNaN(s) || isNaN(e) || e <= s) return null;
    return ((e - s) / (1000 * 60 * 60)).toFixed(2);
  }

  // ===== GROUP BY DATE =====
  const groups = allShifts.reduce((acc, shift) => {
    const dateKey = new Date(shift.date + 'T00:00:00').toLocaleDateString([], {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(shift);
    return acc;
  }, {});

  container.innerHTML = Object.entries(groups).map(([day, shifts]) => `
    <section class="history-day">
      <h2 class="history-day-title">${day}</h2>
      ${shifts.map(shift => {
        const morningHrs = calcHrs(shift.morning_in, shift.morning_out);
        const afternoonHrs = calcHrs(shift.afternoon_in, shift.afternoon_out);
        const overtimeHrs = calcHrs(shift.overtime_start, shift.overtime_end);

        return `
          <div class="history-shift-card">
            <div class="history-sessions-grid">

              ${shift.morning_in && shift.morning_out ? `
                <div class="history-session-block">
                  <div class="history-session-label">Morning</div>
                  <div class="history-session-time">
                    ${fmtTime(shift.morning_in)} - ${fmtTime(shift.morning_out)}
                  </div>
                  <div class="history-session-duration">(${morningHrs} hrs)</div>
                </div>
              ` : ''}

              ${shift.afternoon_in && shift.afternoon_out ? `
                <div class="history-session-block">
                  <div class="history-session-label">Afternoon</div>
                  <div class="history-session-time">
                    ${fmtTime(shift.afternoon_in)} - ${fmtTime(shift.afternoon_out)}
                  </div>
                  <div class="history-session-duration">(${afternoonHrs} hrs)</div>
                </div>
              ` : ''}

              ${shift.overtime_start && shift.overtime_end ? `
                <div class="history-session-block">
                  <div class="history-session-label">Overtime</div>
                  <div class="history-session-time">
                    ${fmtTime(shift.overtime_start)} - ${fmtTime(shift.overtime_end)}
                  </div>
                  <div class="history-session-duration">(${overtimeHrs} hrs)</div>
                </div>
              ` : ''}

            </div>
            ${shift.notes ? `<div class="history-shift-note">📝 ${shift.notes}</div>` : ''}
            <div class="history-shift-total ${(shift.total_hours || 0) < 8 ? 'is-short' : ''}">
              ${(shift.total_hours || 0).toFixed(2)}h
              ${(shift.total_hours || 0) < 8 ? '<span class="short-tag">Short</span>' : ''}
            </div>
          </div>
        `;
      }).join('')}
    </section>
  `).join('');
}

// === SETTINGS PAGE ===
function renderSettingsPage() {
  if (!currentUser) return;
  const nameInput = document.getElementById('settings-name-input');
  const hoursInput = document.getElementById('required-hours');
  if (nameInput) nameInput.value = currentUser.fullName || '';
  if (hoursInput) hoursInput.value = currentUser.requiredHours ?? '';
  updateProfilePicturePreview();
}

async function saveSettings() {
  const saveBtn = document.getElementById('save-settings-btn');
  setButtonLoading(saveBtn, true, 'Saving...');

  const fullName = document.getElementById('settings-name-input')?.value.trim() || currentUser.fullName;

  try {
    const { error } = await supabase.from('profiles').update({
      full_name: fullName
    }).eq('id', currentUser.id);

    if (error) {
      showToast('Error saving settings: ' + error.message);
      return;
    }

    currentUser.fullName = fullName;
    updateDashboard();
    showToast('Settings saved');
    navTo('dashboard');
  } finally {
    setButtonLoading(saveBtn, false);
  }
}

// === PROFILE PICTURE FUNCTIONS ===
async function handleProfilePictureUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Validate file type
  if (!['image/jpeg', 'image/png'].includes(file.type)) {
    showToast('Please upload a JPG or PNG image');
    return;
  }

  // Validate file size (max 5MB)
  if (file.size > 5 * 1024 * 1024) {
    showToast('Image size must be less than 5MB');
    return;
  }

  if (!currentUser?.id) {
    showToast('User not logged in');
    return;
  }

  showToast('Uploading profile picture...');

  try {
    // Generate unique filename
    const ext = file.type === 'image/png' ? 'png' : 'jpg';
    const fileName = `${currentUser.id}-${Date.now()}.${ext}`;

    // Delete old profile picture if it exists
    if (currentUser.profilePictureUrl) {
      const oldFileName = currentUser.profilePictureUrl.split('/').pop();
      await supabase.storage
        .from('profile-pictures')
        .remove([oldFileName]);
    }

    // Upload new image to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('profile-pictures')
      .upload(fileName, file);

    if (uploadError) {
      showToast('Failed to upload image: ' + uploadError.message);
      return;
    }

    // Get public URL
    const { data } = supabase.storage
      .from('profile-pictures')
      .getPublicUrl(fileName);

    const imageUrl = data.publicUrl;

    // Save URL to database
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ profile_picture_url: imageUrl })
      .eq('id', currentUser.id);

    if (updateError) {
      showToast('Failed to save profile picture: ' + updateError.message);
      return;
    }

    currentUser.profilePictureUrl = imageUrl;
    updateProfilePicturePreview();
    updateAvatarDisplay();
    showToast('Profile picture updated successfully');
  } catch (err) {
    console.error('Profile picture upload error:', err);
    showToast('Error uploading profile picture');
  }
}

function updateProfilePicturePreview() {
  const preview = document.getElementById('profile-pic-preview');
  const removeBtn = document.getElementById('remove-pic-btn-container');
  
  if (!preview) return;

  const profilePic = currentUser?.profilePictureUrl;

  if (profilePic) {
    preview.style.backgroundImage = `url('${profilePic}')`;
    preview.classList.add('has-image');
    preview.textContent = '';
    if (removeBtn) removeBtn.style.display = 'flex';
  } else {
    const firstName = getFirstName(currentUser?.fullName || 'User');
    const initials = firstName.slice(0, 2).toUpperCase();
    preview.style.backgroundImage = '';
    preview.classList.remove('has-image');
    preview.textContent = initials;
    if (removeBtn) removeBtn.style.display = 'none';
  }
}

async function removeProfilePicture() {
  if (!confirm('Are you sure you want to remove your profile picture?')) return;
  
  if (!currentUser?.id) {
    showToast('User not logged in');
    return;
  }

  showToast('Removing profile picture...');

  try {
    // Delete file from storage if it exists
    if (currentUser.profilePictureUrl) {
      const fileName = currentUser.profilePictureUrl.split('/').pop();
      await supabase.storage
        .from('profile-pictures')
        .remove([fileName]);
    }

    // Update database
    const { error } = await supabase
      .from('profiles')
      .update({ profile_picture_url: null })
      .eq('id', currentUser.id);

    if (error) {
      showToast('Failed to remove picture: ' + error.message);
      return;
    }

    currentUser.profilePictureUrl = null;
    updateProfilePicturePreview();
    updateAvatarDisplay();
    showToast('Profile picture removed');
  } catch (err) {
    console.error('Error removing profile picture:', err);
    showToast('Error removing profile picture');
  }
}

function updateAvatarDisplay() {
  const avatarEl = document.getElementById('user-avatar');
  if (!avatarEl) return;

  const profilePic = currentUser?.profilePictureUrl;

  if (profilePic) {
    avatarEl.style.backgroundImage = `url('${profilePic}')`;
    avatarEl.style.backgroundSize = 'cover';
    avatarEl.style.backgroundPosition = 'center';
    avatarEl.textContent = '';
  } else {
    avatarEl.style.backgroundImage = '';
    const firstName = getFirstName(currentUser?.fullName || 'User');
    const initials = firstName.slice(0, 2).toUpperCase();
    avatarEl.textContent = initials;
  }
}

// === DTR MODAL ===
let dtrReturnFocus = null;

function handleDTRKeys(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeDTRModal();
  }
  if (event.key !== 'Tab') return;
  const controls = [...document.querySelectorAll('#dtr-modal button, #dtr-modal input')]
    .filter(el => !el.disabled && el.getClientRects().length);
  const first = controls[0];
  const last = controls[controls.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}

function openDTRModal() {
  const modal = document.getElementById('dtr-modal');
  if (!modal) return;
  dtrReturnFocus = document.activeElement;
  modal.style.display = 'grid';
  document.getElementById('main-content-container').inert = true;
  document.getElementById('topbar-container').inert = true;
  document.body.style.overflow = 'hidden';
  document.addEventListener('keydown', handleDTRKeys);
  const nameInput = document.getElementById('dtr-full-name');
  if (nameInput && currentUser?.fullName) nameInput.value = currentUser.fullName;
  nameInput?.focus();
}

function closeDTRModal() {
  const modal = document.getElementById('dtr-modal');
  if (modal) modal.style.display = 'none';
  document.getElementById('main-content-container').inert = false;
  document.getElementById('topbar-container').inert = false;
  document.body.style.overflow = '';
  document.removeEventListener('keydown', handleDTRKeys);
  document.getElementById('dtr-form')?.reset();
  toggleSignatureSection(false);
  dtrReturnFocus?.focus();
}

function toggleSignatureSection(show) {
  const section = document.getElementById('signature-section');
  if (!section) return;
  if (show) {
    section.style.display = 'grid';
  } else {
    section.style.display = 'none';
  }
}

function validateDTRForm() {
  const requiredFields = ['dtr-full-name', 'dtr-school', 'dtr-department', 'dtr-company', 'dtr-position'];
  let valid = true;
  requiredFields.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (!el.value.trim()) {
      el.style.borderColor = '#c0392b';
      valid = false;
    } else {
      el.style.borderColor = '';
    }
  });
  return valid;
}

function getDTRData() {
  // === DTR DATE RANGE ===
  const fromDate = document.getElementById('dtr-range-from')?.value || null;
  const toDate = document.getElementById('dtr-range-to')?.value || null;

  let filteredShifts = [...allShifts].sort((a, b) => a.date.localeCompare(b.date));
  if (fromDate) filteredShifts = filteredShifts.filter(s => s.date >= fromDate);
  if (toDate) filteredShifts = filteredShifts.filter(s => s.date <= toDate);

  // Get profile picture from Supabase
  const profilePicture = currentUser?.profilePictureUrl;

  return {
    fullName: document.getElementById('dtr-full-name')?.value.trim(),
    school: document.getElementById('dtr-school')?.value.trim(),
    department: document.getElementById('dtr-department')?.value.trim(),
    company: document.getElementById('dtr-company')?.value.trim(),
    position: document.getElementById('dtr-position')?.value.trim(),
    includeSignature: document.getElementById('dtr-include-signature')?.checked,
    supervisorName: document.getElementById('dtr-supervisor-name')?.value.trim(),
    supervisorTitle: document.getElementById('dtr-supervisor-title')?.value.trim(),
    profilePicture: profilePicture,
    shifts: filteredShifts
  };
}

function exportDTR(type) {
  if (!validateDTRForm()) {
    showToast('Please fill in all required fields');
    return;
  }
  const data = getDTRData();
  if (type === 'print') generateDTRPrint(data);
  else if (type === 'csv') generateDTRCSV(data);
  else if (type === 'excel') generateDTRExcel(data);
}

// === PDF PRINT ===
function generateDTRPrint(data) {
  const printWindow = window.open('', '_blank');
  const rows = data.shifts.map(shift => `
    <tr>
      <td>${String(shift.date).slice(0, 10)}</td>
      <td>
        ${shift.morning_in && shift.morning_out ? `${shift.morning_in} - ${shift.morning_out}` : ''}
        ${shift.afternoon_in && shift.afternoon_out ? `, ${shift.afternoon_in} - ${shift.afternoon_out}` : ''}
        ${shift.overtime_start && shift.overtime_end ? `, ${shift.overtime_start} - ${shift.overtime_end} (OT)` : ''}
      </td>
      <td>${(shift.total_hours || 0).toFixed(2)}</td>
    </tr>
  `).join('');

  const totalHours = data.shifts.reduce((sum, s) => sum + (s.total_hours || 0), 0);
  const profilePicHTML = data.profilePicture ? `<img src="${data.profilePicture}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover;" />` : '';

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>DTR - ${data.fullName}</title>
      <style>
        body { font-family: serif; margin: 20px; color: #000; }
        .dtr-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .doc-header { display: flex; justify-content: space-between; font-size: 11px; }
        .profile-section { display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; }
        h1 { text-align: center; font-size: 18px; margin: 0; }
        .subtitle { text-align: center; font-size: 13px; margin-bottom: 20px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 20px; font-size: 13px; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { background: #f0f0f0; padding: 8px; border: 1px solid #000; text-align: left; }
        td { padding: 8px; border: 1px solid #000; }
        .total-row td { font-weight: bold; text-align: right; }
        .signature-block { margin-top: 40px; display: flex; gap: 40px; font-size: 13px; }
        .sig-line { border-top: 1px solid #000; padding-top: 6px; margin-top: 30px; width: 220px; }
        @media print { body { margin: 0; } }
      </style>
    </head>
    <body>
      <div class="dtr-header">
        <div class="doc-header">
          <span>${new Date().toLocaleString()}</span>
        </div>
        ${data.profilePicture ? `
          <div class="profile-section">
            ${profilePicHTML}
            <span style="font-size: 12px; font-weight: bold;">${data.fullName}</span>
          </div>
        ` : ''}
      </div>
      <h1>DAILY TIME RECORD</h1>
      <p class="subtitle">On-the-Job Training</p>
      <div class="info-grid">
        <div><strong>Name:</strong> ${data.fullName}</div>
        <div><strong>Company:</strong> ${data.company}</div>
        <div><strong>School:</strong> ${data.school}</div>
        <div><strong>Position:</strong> ${data.position}</div>
        <div><strong>Department / Course:</strong> ${data.department}</div>
      </div>
      <table>
        <thead>
          <tr><th>Date</th><th>Time In - Out</th><th>Hours</th></tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr class="total-row">
            <td colspan="2">Total Hours:</td>
            <td>${totalHours.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
      ${data.includeSignature ? `
        <div class="signature-block">
          <div>
            <p>Certified Correct:</p>
            <div class="sig-line">${data.supervisorName}<br>${data.supervisorTitle}</div>
          </div>
          <div>
            <p>&nbsp;</p>
            <div class="sig-line">Intern Signature<br>Date: _______________</div>
          </div>
        </div>
      ` : ''}
    </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.print();
}

// === CSV EXPORT ===
function generateDTRCSV(data) {
  const totalHours = data.shifts.reduce((sum, s) => sum + (s.total_hours || 0), 0);
  const rows = [
    ['DAILY TIME RECORD - OJT'],
    ['Name:', data.fullName],
    ['School:', data.school],
    ['Department/Course:', data.department],
    ['Company:', data.company],
    ['Position:', data.position],
    [''],
    ['Date', 'Time In', 'Time Out', 'Hours'],
    ...data.shifts.map(s => [
      s.date,
      s.morning_in || '',
      s.morning_out || '',
      (s.total_hours || 0).toFixed(2)
    ]),
    ['', '', '', ''],
    ['Total Hours:', '', '', totalHours.toFixed(2)]
  ];

  const csv = rows.map(row =>
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  ).join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `DTR_${data.fullName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  closeDTRModal();
  showToast('DTR CSV exported');
}

// === EXCEL EXPORT ===
function generateDTRExcel(data) {
  const totalHours = data.shifts.reduce((sum, s) => sum + (s.total_hours || 0), 0);
  const wsData = [
    ['DAILY TIME RECORD - OJT'],
    ['Name:', data.fullName],
    ['School:', data.school],
    ['Department/Course:', data.department],
    ['Company:', data.company],
    ['Position:', data.position],
    [''],
    ['Date', 'Time In', 'Time Out', 'Hours'],
    ...data.shifts.map(s => [
      s.date,
      s.morning_in || '',
      s.morning_out || '',
      (s.total_hours || 0).toFixed(2)
    ]),
    ['', '', '', ''],
    ['Total Hours:', '', '', totalHours.toFixed(2)]
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [{ wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'DTR');
  XLSX.writeFile(wb, `DTR_${data.fullName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.xlsx`);
  closeDTRModal();
  showToast('DTR Excel exported');
}

// === CONFIRM BEFORE LEAVING ===
let shiftFormDirty = false;

function markFormDirty() {
  shiftFormDirty = true;
}

function markFormClean() {
  shiftFormDirty = false;
}

function confirmLeave(callback) {
  if (!shiftFormDirty) {
    callback();
    return;
  }
  const confirmed = confirm('You have unsaved changes in the shift form. Are you sure you want to leave?');
  if (confirmed) {
    markFormClean();
    callback();
  }
}

// === EVENT LISTENERS ===
function setupEventListeners() {
  ['show-professor-signup', 'student-to-professor-signup'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', event => {
      event.preventDefault(); clearAuthErrors(); showAuthUI('signup-professor');
    });
  });
  document.getElementById('professor-to-student-signup')?.addEventListener('click', event => {
    event.preventDefault(); clearAuthErrors(); showAuthUI('signup');
  });
  document.getElementById('professor-show-login')?.addEventListener('click', event => {
    event.preventDefault(); clearAuthErrors(); showAuthUI('login');
  });
  ['refresh-account-access', 'retry-account-access'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', refreshAccountAccess);
  });
  document.getElementById('show-signup')?.addEventListener('click', (e) => {
    e.preventDefault();
    clearAuthErrors();
    showAuthUI('signup');
  });

  document.getElementById('show-login')?.addEventListener('click', (e) => {
    e.preventDefault();
    clearAuthErrors();
    showAuthUI('login');
  });

  // ===== FORGOT PASSWORD NAVIGATION =====
  document.getElementById('show-forgot')?.addEventListener('click', (e) => {
    e.preventDefault();
    clearAuthErrors();
    showAuthUI('forgot');
  });

  document.getElementById('show-login-from-forgot')?.addEventListener('click', (e) => {
    e.preventDefault();
    clearAuthErrors();
    showAuthUI('login');
  });

  // ===== FORGOT PASSWORD FORM =====
  document.getElementById('forgot-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('forgot-submit');
    const errorEl = document.getElementById('forgot-error');
    const successEl = document.getElementById('forgot-success');

    errorEl.textContent = '';
    errorEl.classList.remove('is-visible');
    successEl.style.display = 'none';

    setButtonLoading(submitBtn, true, 'Sending...');
    const email = document.getElementById('forgot-email').value.trim();

    try {
      const result = await auth.forgotPassword(email);
      if (!result.success) {
        errorEl.textContent = result.message;
        errorEl.classList.add('is-visible');
      } else {
        successEl.textContent = result.message;
        successEl.style.display = 'block';
        document.getElementById('forgot-email').value = '';
      }
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });

  // ===== RESET PASSWORD FORM =====
  document.getElementById('reset-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('reset-submit');
    const errorEl = document.getElementById('reset-error');

    errorEl.textContent = '';
    errorEl.classList.remove('is-visible');

    setButtonLoading(submitBtn, true, 'Updating...');
    const newPassword = document.getElementById('reset-password').value;
    const confirmPassword = document.getElementById('reset-confirm').value;

    try {
      const result = await auth.resetPassword(newPassword, confirmPassword);
      if (!result.success) {
        errorEl.textContent = result.message;
        errorEl.classList.add('is-visible');
      } else {
        showToast('✅ Password updated! Please sign in.');
        showAuthUI('login');
      }
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });

  document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAuthErrors();
    const submitBtn = document.getElementById('login-submit');
    setButtonLoading(submitBtn, true, 'Signing in...');
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    try {
      const result = await auth.login(email, password);
      if (!result.success) {
        setFormError('login-error', result.message || 'Login failed');
        return;
      }
      await loadUserData();
      await showAppUI();
      showToast('Logged in successfully');
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });

  async function registerAccount(event, accountType) {
    event.preventDefault();
    clearAuthErrors();
    const prefix = accountType === 'professor' ? 'professor-signup' : 'signup';
    const submitBtn = document.getElementById(`${prefix}-submit`);
    setButtonLoading(submitBtn, true, 'Creating account...');
    const fullName = document.getElementById(`${prefix}-name`).value.trim();
    const email = document.getElementById(`${prefix}-email`).value.trim();
    const password = document.getElementById(`${prefix}-password`).value;
    const confirmPassword = document.getElementById(`${prefix}-confirm`).value;
    const requiredHours = undefined; // Allocated by the student's professor after registration.
    const registration = { accountType };
    if (accountType === 'professor') {
      registration.institution = document.getElementById('professor-signup-institution').value.trim();
      registration.department = document.getElementById('professor-signup-department').value.trim();
    }
    try {
      const result = await auth.signup(fullName, email, password, confirmPassword, requiredHours, registration);
      if (!result.success) {
        setFormError(`${prefix}-error`, result.message || 'Signup failed');
        return;
      }
      event.target.reset();
      if (result.needsEmailConfirmation) {
        showAuthUI('login');
        const info = document.getElementById('login-info');
        info.textContent = result.message;
        info.style.display = 'block';
        return;
      }
      await loadUserData();
      await showAppUI();
      showToast(result.message);
    } catch (error) {
      console.error('Registration:', error);
      setFormError(`${prefix}-error`, 'Could not complete registration. Please try signing in if the account was already created.');
    } finally { setButtonLoading(submitBtn, false); }
  }
  document.getElementById('signup-form')?.addEventListener('submit', event => registerAccount(event, 'student'));
  document.getElementById('professor-signup-form')?.addEventListener('submit', event => registerAccount(event, 'professor'));

  document.getElementById('dtr-include-signature')?.addEventListener('change', (e) => {
    toggleSignatureSection(e.target.checked);
  });

  document.getElementById('shift-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveShift();
  });

  ['morning-in', 'morning-out', 'afternoon-in', 'afternoon-out', 'overtime-start', 'overtime-end'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => {
      markFormDirty();
      updateShiftDurations();
    });
  });
  
  // ===== MARK DIRTY ON DATE AND NOTES CHANGE =====
  document.getElementById('shift-date')?.addEventListener('change', markFormDirty);
  document.getElementById('shift-notes')?.addEventListener('input', markFormDirty);

  document.getElementById('shift-filter-date')?.addEventListener('input', renderShiftHistory);
}

// === INIT ===
async function initializeApp() {
  // ===== CHECK IF USER ARRIVED FROM PASSWORD RESET EMAIL =====
  const urlParams = new URLSearchParams(window.location.search);
  const isReset = urlParams.get('reset') === 'true';
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const accessToken = hashParams.get('access_token');
  const type = hashParams.get('type');

  if ((isReset || type === 'recovery') && accessToken) {
    // ===== SET SESSION FROM RESET LINK =====
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: hashParams.get('refresh_token') || ''
    });
    if (error) throw error;
    await auth.init();
    showAuthUI('reset');
    setupEventListeners();
    return;
  }

  setupEventListeners();
  setDefaultShiftDate();

  await auth.init();

  if (auth.isAuthenticated) {
    await loadUserData();
    if (currentUser) {
      await showAppUI();
      return;
    }
  }

  showAuthUI('login');
}

// === WARN BEFORE CLOSING TAB ===
window.addEventListener('beforeunload', (e) => {
  if (shiftFormDirty) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// Refresh date-dependent missions and streaks when a tab stays open overnight.
let lastRewardDate = Gamification.dateKey();
function refreshRewardDate() {
  const today = Gamification.dateKey();
  if (today === lastRewardDate) return;
  lastRewardDate = today;
  const dateInput = document.getElementById('shift-date');
  if (dateInput) dateInput.max = today;
  if (currentUser) updateDashboard();
}
setInterval(refreshRewardDate, 60000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshRewardDate();
});

document.addEventListener('DOMContentLoaded', () => Startup.run(initializeApp));
