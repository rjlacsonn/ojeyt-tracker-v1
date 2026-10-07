/* ============================================================
   TIMER — OJeyT Tracker
   ============================================================ */

const Timer = (() => {
  let interval = null;
  let startTime = null;
  let pausedTime = 0; // Accumulated paused duration in seconds
  let isPaused = false;
  let pauseStartTime = null; // When pause was initiated

  function format(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
  }

  function elapsed() {
    if (!startTime) return 0;
    const now = Date.now();
    const total = Math.floor((now - startTime) / 1000);
    // Subtract the paused durations
    return Math.max(0, total - pausedTime);
  }

  function start(savedStart, onTick) {
    startTime = savedStart ? new Date(savedStart) : new Date();
    pausedTime = 0;
    isPaused = false;
    if (interval) clearInterval(interval);
    interval = setInterval(() => {
      onTick(format(elapsed()));
    }, 1000);
    // tick immediately
    onTick(format(elapsed()));
    return startTime;
  }

  function pause() {
    if (!interval || isPaused) return false;
    isPaused = true;
    pauseStartTime = Date.now();
    clearInterval(interval);
    interval = null;
    return true;
  }

  function resume(onTick) {
    if (!isPaused || !pauseStartTime) return false;
    // Add the paused duration to pausedTime
    pausedTime += Math.floor((Date.now() - pauseStartTime) / 1000);
    pauseStartTime = null;
    isPaused = false;
    
    if (interval) clearInterval(interval);
    interval = setInterval(() => {
      onTick(format(elapsed()));
    }, 1000);
    onTick(format(elapsed()));
    return true;
  }

  function reset() {
    const secs = elapsed();
    clearInterval(interval);
    interval = null;
    startTime = null;
    pausedTime = 0;
    isPaused = false;
    pauseStartTime = null;
    return secs;
  }

  function stop() {
    const secs = elapsed();
    clearInterval(interval);
    interval = null;
    const was = startTime;
    startTime = null;
    pausedTime = 0;
    isPaused = false;
    pauseStartTime = null;
    return { duration: secs, startedAt: was };
  }

  function isRunning() {
    return interval !== null && !isPaused;
  }

  function getIsPaused() {
    return isPaused;
  }

  return { start, stop, pause, resume, reset, isRunning, getIsPaused, format };
})();
