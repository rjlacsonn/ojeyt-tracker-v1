let previousRewards = null;
let gamificationError = '';

async function loadGamificationSettings() {
  Gamification.resetBadges(); gamificationError = '';
  if (!currentUser || currentUser.accountType !== 'student' || currentUser.accountStatus !== 'active') return;
  const { data, error } = await supabase.rpc('ojt_badges');
  if (error) { gamificationError = error.message || 'Could not load badge settings.'; return; }
  try { Gamification.setBadges(data || []); }
  catch (error) { gamificationError = error.message || 'Badge settings are invalid.'; }
}

function resetGamification() {
  previousRewards = null; gamificationError = ''; Gamification.resetBadges();
}

function renderGamification(celebrate = false) {
  const panel = document.getElementById('gamification-panel');
  if (!panel || !currentUser) return;
  const rewards = Gamification.calculate(allShifts, currentUser.requiredHours, new Date(), OJT_HOLIDAYS);
  if (celebrate && previousRewards?.userId === currentUser.id) {
    const unlocked = rewards.badges.filter(b => b.earned && !previousRewards.earned.includes(b.id));
    if (unlocked.length) showToast(`Badge unlocked: ${unlocked.map(b => `${b.icon} ${b.name}`).join(' · ')}`);
    if (rewards.levelIndex > previousRewards.levelIndex) showToast(`Level up! You're now a ${rewards.level.name}.`);
  }
  previousRewards = {
    userId: currentUser.id,
    earned: rewards.badges.filter(b => b.earned).map(b => b.id),
    levelIndex: rewards.levelIndex,
  };
  // Keep reward notifications up to date without rendering the collection on other pages.
  if (currentPage !== 'badges') return;
  const earned = rewards.badges.filter(b => b.earned).length;
  const dailyShift = rewards.dailyDone > 0;
  const dailyNote = rewards.dailyDone === 2;
  const earnedBadges = rewards.badges.filter(b => b.earned);
  const availableBadges = rewards.badges.filter(b => !b.earned && !b.waitingForTarget);
  const spotlightBadge = [...earnedBadges].sort((a, b) => b.xp - a.xp || b.goal - a.goal || b.order - a.order)[0]
    || [...availableBadges].sort((a, b) => b.progress - a.progress || b.xp - a.xp)[0]
    || rewards.badges[0];
  const nextBadge = [...availableBadges].sort((a, b) => b.progress - a.progress || b.xp - a.xp)[0];
  const spotlightEarned = Boolean(spotlightBadge?.earned);
  const formatMetric = value => Number.isInteger(value) ? value.toLocaleString() : Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 });
  const badgeProgressText = badge => badge.waitingForTarget
    ? 'Waiting for assigned hours'
    : badge.earned
      ? 'Achievement unlocked'
      : `${formatMetric(badge.value)} of ${formatMetric(badge.goal)} complete`;
  panel.innerHTML = `
    ${gamificationError ? `<p class="doc-error rewards-error" role="alert">${DocumentRequirements.escape(gamificationError)}</p>` : ''}
    <div class="rewards-overview">
      <div class="rewards-level-topline"><div class="rewards-eyebrow">LEVEL ${rewards.levelIndex + 1} OF ${Gamification.LEVELS.length}</div><span class="rewards-earned-count">${earned} badge${earned === 1 ? '' : 's'} earned</span></div>
      <div class="rewards-level-row"><div><span class="rewards-level-label">Current rank</span><h2>${rewards.level.name}</h2></div><strong>${rewards.xp.toLocaleString()} <small>XP</small></strong></div>
      <div class="rewards-meter" role="progressbar" aria-label="Progress to next intern level" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.floor(rewards.levelProgress)}">
        <span style="width:${rewards.levelProgress}%"><i aria-hidden="true"></i></span>
      </div>
      <p class="rewards-next">${rewards.nextLevel ? `${rewards.nextLevel.xp - rewards.xp} XP to ${rewards.nextLevel.name}` : 'Highest level reached. Keep building your skills!'}</p>
      <div class="rewards-goals">
        <div class="rewards-goals-title"><span>Today’s missions</span><b>${rewards.dailyDone} / 2 done</b></div>
        <ul class="rewards-checklist">
          <li class="${dailyShift ? 'is-complete' : ''}"><i aria-hidden="true">${dailyShift ? '✓' : ''}</i><span><strong>Log a shift today</strong><small>Record your attendance</small></span><b>+50 XP</b></li>
          <li class="${dailyNote ? 'is-complete' : ''}"><i aria-hidden="true">${dailyNote ? '✓' : ''}</i><span><strong>Add your accomplishment</strong><small>Write it in your shift notes</small></span><b>+25 XP</b></li>
        </ul>
        <div class="rewards-weekly"><div><span>Weekly goal</span><strong>${Math.min(rewards.weekDays, 5)} of 5 days</strong></div><div class="rewards-weekly-track" aria-label="${Math.min(rewards.weekDays, 5)} of 5 weekly attendance days completed">${Array.from({ length: 5 }, (_, index) => `<i class="${index < rewards.weekDays ? 'is-complete' : ''}">${index < rewards.weekDays ? '✓' : index + 1}</i>`).join('')}</div></div>
      </div>
      <details class="rewards-rules"><summary>How rewards work</summary>
        <p>Earn 50 XP per recorded day and 25 XP for that day’s accomplishment. Each badge adds its listed bonus once. Extra shifts on the same date and overtime add no daily XP.</p>
        <p>Existing shifts count automatically. Future and zero-hour entries do not count. XP and badges reflect your saved records and current hour target; correcting or deleting records can change them.</p>
        <p>Attendance: ${rewards.attendanceXP} XP · Accomplishments: ${rewards.accomplishmentXP} XP · Badges: ${rewards.badgeXP} XP</p>
      </details>
    </div>
    <div class="rewards-collection">
      ${spotlightBadge ? `<section class="reward-spotlight ${spotlightEarned ? 'is-earned' : 'is-in-progress'}" aria-label="${spotlightEarned ? 'Standout badge' : 'Closest badge'}">
        <div class="reward-spotlight-copy"><span class="reward-spotlight-eyebrow">${spotlightEarned ? '★ YOUR STANDOUT BADGE' : '★ YOU’RE CLOSEST TO THIS'}</span><h3>${DocumentRequirements.escape(spotlightBadge.name)}</h3><p>${DocumentRequirements.escape(spotlightBadge.description)}</p><div class="reward-spotlight-meta"><strong>${spotlightEarned ? 'Proudly earned' : `${spotlightBadge.progress}% complete`}</strong><span>+${spotlightBadge.xp} XP</span></div>${spotlightEarned ? '<p class="reward-spotlight-note">This is your highest-value achievement so far. Keep it going!</p>' : `<div class="reward-spotlight-progress"><span style="width:${spotlightBadge.progress}%"></span></div><p class="reward-spotlight-note">${badgeProgressText(spotlightBadge)}</p>`}</div>
        <div class="reward-spotlight-emblem" aria-hidden="true"><span>${DocumentRequirements.escape(spotlightBadge.icon)}</span><i></i></div>
      </section>` : ''}
      <div class="rewards-collection-heading"><div><span class="rewards-section-kicker">YOUR COLLECTION</span><h3>Achievement badges</h3></div><span>${earned} / ${rewards.badges.length} unlocked</span></div>
      <p class="rewards-caption">Earn badges by showing up, reflecting on your work, and reaching your OJT milestones.</p>
      ${nextBadge && spotlightEarned ? `<div class="rewards-next-unlock"><span aria-hidden="true">⚡</span><p><strong>Next within reach: ${DocumentRequirements.escape(nextBadge.name)}</strong><small>${nextBadge.progress}% complete · ${badgeProgressText(nextBadge)}</small></p></div>` : ''}
      <div class="rewards-badge-grid">${rewards.badges.map(b => `
        <article class="reward-badge ${b.earned ? 'is-earned' : 'is-locked'}" aria-label="${DocumentRequirements.escape(b.name)}, ${b.earned ? 'earned' : `${b.progress}% complete`}">
          <div class="reward-badge-topline"><span class="reward-badge-icon" aria-hidden="true">${DocumentRequirements.escape(b.icon)}</span><span class="reward-badge-xp">+${b.xp} XP</span></div>
          <div class="reward-badge-copy"><strong>${DocumentRequirements.escape(b.name)}</strong><p>${DocumentRequirements.escape(b.description)}</p></div>
          <div class="reward-badge-footer"><span class="reward-badge-status">${b.waitingForTarget ? 'Hours not assigned' : b.earned ? '<i aria-hidden="true">✓</i> Earned' : `${b.progress}% complete`}</span><div class="reward-badge-meter" role="progressbar" aria-label="Badge progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${b.progress}"><span style="width:${b.progress}%"></span></div><small>${badgeProgressText(b)}</small></div>
        </article>`).join('')}
      </div>
    </div>`;
}
