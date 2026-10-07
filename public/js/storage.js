/* ============================================================
   STORAGE — OJeyT Tracker
   Handles all localStorage read/write operations
   ============================================================ */

const Storage = (() => {
  const KEY = 'ojeyt_v1';

  function load() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '{}');
    } catch {
      return {};
    }
  }

  function save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('OJeyT: Could not save to localStorage', e);
    }
  }

  function clear() {
    localStorage.removeItem(KEY);
  }

  return { load, save, clear };
})();
