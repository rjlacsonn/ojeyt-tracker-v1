/* Visible from the first paint, before the SDK and account data are ready. */
const Startup = (() => {
  const loader = document.getElementById('app-loader');
  const spinner = document.getElementById('app-loader-spinner');
  const message = document.getElementById('app-loader-message');
  const retry = document.getElementById('app-loader-retry');
  let finished = false;
  let timeout;
  function fail(text) {
    if (finished) return;
    clearTimeout(timeout);
    spinner.hidden = true;
    message.textContent = text;
    message.setAttribute('role', 'alert');
    retry.hidden = false;
  }
  retry.addEventListener('click', () => window.location.reload());
  timeout = setTimeout(() => fail('Loading is taking longer than expected. Check your connection, or reload to try again.'), 30000);
  async function run(initialize) {
    try {
      await initialize();
      finished = true;
      clearTimeout(timeout);
      loader.hidden = true;
      document.body.classList.remove('app-loading');
      document.body.setAttribute('aria-busy', 'false');
    } catch (error) {
      console.error('App startup:', error);
      fail('We could not load your workspace. Check your connection and reload to try again.');
    }
  }
  return { run };
})();
