let previousRewards = null;

function resetGamification() {
  previousRewards = null;
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
  panel.innerHTML = `
    <div class="rewards-overview">
      <div class="rewards-eyebrow">YOUR OJT LEVEL · ${rewards.levelIndex + 1} / ${Gamification.LEVELS.length}</div>
      <div class="rewards-level-row"><h2>${rewards.level.name}</h2><strong>${rewards.xp.toLocaleString()} XP</strong></div>
      <div class="rewards-meter" role="progressbar" aria-label="Progress to next intern level" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.floor(rewards.levelProgress)}">
        <span style="width:${rewards.levelProgress}%"></span>
      </div>
      <p class="rewards-next">${rewards.nextLevel ? `${rewards.nextLevel.xp - rewards.xp} XP to ${rewards.nextLevel.name}` : 'Highest level reached. Keep building your skills!'}</p>
      <div class="rewards-goals">
        <div class="rewards-goal"><div><strong>Daily mission</strong><span>Log today’s shift + an accomplishment</span></div><b>${rewards.dailyDone} / 2</b></div>
        <ul class="rewards-checklist">
          <li>${dailyShift ? '✓' : '○'} Log a shift today <span>50 XP</span></li>
          <li>${dailyNote ? '✓' : '○'} Describe what you accomplished in shift notes <span>25 XP</span></li>
        </ul>
        <div class="rewards-goal"><div><strong>Weekly goal</strong><span>Log attendance on 5 different days · Mon–Sun</span></div><b>${Math.min(rewards.weekDays, 5)} / 5 ${rewards.weekDays >= 5 ? '✓' : ''}</b></div>
      </div>
      <details class="rewards-rules"><summary>How rewards work</summary>
        <p>Earn 50 XP per recorded day and 25 XP for that day’s accomplishment. Each badge adds its listed bonus once. Extra shifts on the same date and overtime add no daily XP.</p>
        <p>Existing shifts count automatically. Future and zero-hour entries do not count. XP and badges reflect your saved records and current hour target; correcting or deleting records can change them.</p>
        <p>Attendance: ${rewards.attendanceXP} XP · Accomplishments: ${rewards.accomplishmentXP} XP · Badges: ${rewards.badgeXP} XP</p>
      </details>
    </div>
    <div class="rewards-collection">
      <div class="rewards-collection-heading"><h3>Achievement badges</h3><span>${earned} / ${rewards.badges.length} earned</span></div>
      <p class="rewards-caption">Small wins. Steady progress. Your next milestone is waiting.</p>
      <div class="rewards-badge-grid">${rewards.badges.map(b => `
        <div class="reward-badge ${b.earned ? 'is-earned' : 'is-locked'}">
          <span class="reward-badge-icon" aria-hidden="true">${b.icon}</span>
          <strong>${b.name}</strong>
          <p>${b.description}</p>
          <span class="reward-badge-status">${b.waitingForTarget ? 'Waiting for professor to assign hours' : b.earned ? '✓ Earned' : `${b.progress}% complete`} · +${b.xp} XP</span>
          <div class="reward-badge-meter" aria-hidden="true"><span style="width:${b.progress}%"></span></div>
        </div>`).join('')}
      </div>
    </div>`;
}
