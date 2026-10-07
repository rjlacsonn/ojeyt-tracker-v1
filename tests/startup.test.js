const fs = require('fs');
const path = require('path');
const read = name => fs.readFileSync(path.join(__dirname, `../public/js/${name}.js`), 'utf8');
const startupSource = read('startup');
const authSource = read('auth');
const appSource = read('app');
const initializeSource = appSource.slice(appSource.indexOf('async function initializeApp()'), appSource.indexOf('// === WARN BEFORE CLOSING TAB ==='));

function screen() {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, { hidden: false, textContent: '', attributes: {}, listeners: {},
      setAttribute(key, value) { this.attributes[key] = value; }, addEventListener(type, fn) { this.listeners[type] = fn; } });
    return elements.get(id);
  };
  const classes = new Set(['app-loading']);
  const body = { classList: { remove: key => classes.delete(key) }, setAttribute() {} };
  let timeout, cleared = false, reloaded = false;
  const api = new Function('document', 'window', 'setTimeout', 'clearTimeout', 'console', `${startupSource}\nreturn Startup;`)(
    { getElementById: get, body }, { location: { reload() { reloaded = true; } } },
    fn => { timeout = fn; return 1; }, () => { cleared = true; }, { error() {} });
  return { api, get, loading: () => classes.has('app-loading'), timeout: () => timeout(),
    cleared: () => cleared, reloaded: () => reloaded };
}
function deferred() {
  let resolve; const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
class Params {
  constructor(value) { this.values = new Map(value.replace(/^\?/, '').split('&').map(pair => pair.split('='))); }
  get(key) { return this.values.get(key) || null; }
}
function initialize(hooks) {
  return new Function('auth', 'supabase', 'window', 'URLSearchParams', 'hooks', `
    let currentUser = null;
    const setupEventListeners = () => {};
    const setDefaultShiftDate = () => {};
    const loadUserData = async () => { await hooks.load(); currentUser = hooks.user; };
    const showAppUI = async () => { await hooks.app(); hooks.events.push('app'); };
    const showAuthUI = page => hooks.events.push(page);
    ${initializeSource}
    return initializeApp;
  `)(hooks.auth, hooks.supabase || {}, { location: hooks.location || { search: '', hash: '' } }, Params, hooks);
}
async function runTests() {
  const passed = [];
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const test = async (name, fn) => { await fn(); passed.push(name); };
  await test('Loading screen stays visible until initialization finishes', async () => {
    const s = screen(), pending = deferred(); const run = s.api.run(() => pending.promise);
    assert(s.loading() && !s.get('app-loader').hidden, 'Loader disappeared during initialization');
    pending.resolve(); await run;
    assert(!s.loading() && s.get('app-loader').hidden && s.cleared(), 'Loader remained after initialization');
  });
  await test('Authenticated refresh never renders login while session and data load', async () => {
    const s = screen(), session = deferred(), profile = deferred(), workspace = deferred();
    const hooks = { events: [], user: { id: 'student' }, auth: { isAuthenticated: true, init: () => session.promise }, load: () => profile.promise, app: () => workspace.promise };
    const run = s.api.run(initialize(hooks));
    assert(s.loading() && !hooks.events.length, 'Login shown before session restoration');
    session.resolve(); await Promise.resolve(); await Promise.resolve();
    assert(s.loading() && !hooks.events.length, 'Login shown while profile loading');
    profile.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    assert(s.loading() && !hooks.events.length, 'Workspace revealed prematurely');
    workspace.resolve(); await run;
    assert(hooks.events.join() === 'app' && !s.loading(), 'Authenticated refresh flashed login');
  });
  await test('Signed-out visitor sees login only after session check', async () => {
    const s = screen(), session = deferred();
    const hooks = { events: [], auth: { isAuthenticated: false, init: () => session.promise } };
    const run = s.api.run(initialize(hooks));
    assert(s.loading() && !hooks.events.length, 'Login displayed before session check');
    session.resolve(); await run;
    assert(hooks.events.join() === 'login' && !s.loading(), 'Signed-out visitor cannot sign in');
  });
  await test('Startup failure exposes reload without revealing login', async () => {
    const s = screen(); await s.api.run(async () => { throw new Error('Offline'); });
    assert(s.loading() && !s.get('app-loader-retry').hidden && s.get('app-loader-spinner').hidden, 'No recoverable error state');
    assert(s.get('app-loader-message').attributes.role === 'alert', 'Startup error is not announced');
    s.get('app-loader-retry').listeners.click(); assert(s.reloaded(), 'Reload button does nothing');
  });
  await test('Slow startup offers reload but can still finish successfully', async () => {
    const s = screen(), pending = deferred(); const run = s.api.run(() => pending.promise);
    s.timeout(); assert(s.loading() && !s.get('app-loader-retry').hidden, 'Slow startup traps user indefinitely');
    pending.resolve(); await run; assert(!s.loading() && s.get('app-loader').hidden, 'Late successful startup stuck on timeout');
  });
  await test('Password recovery restores session before revealing reset form', async () => {
    const s = screen(), pending = deferred(), calls = [];
    const hooks = { events: [], location: { search: '?reset=true', hash: '#access_token=token&refresh_token=refresh&type=recovery' },
      auth: { init: async () => calls.push('auth') }, supabase: { auth: { async setSession(value) { calls.push(value); await pending.promise; return { error: null }; } } } };
    const run = s.api.run(initialize(hooks)); assert(s.loading() && !hooks.events.length, 'Reset form revealed too early');
    pending.resolve(); await run;
    assert(calls[0].access_token === 'token' && calls[0].refresh_token === 'refresh' && hooks.events.join() === 'reset' && !s.loading(), 'Password recovery broken');
  });
  await test('Rejected recovery link stays on a recoverable startup error', async () => {
    const s = screen(), hooks = { events: [], location: { search: '', hash: '#access_token=token&type=recovery' },
      supabase: { auth: { setSession: async () => ({ error: new Error('Expired link') }) } } };
    await s.api.run(initialize(hooks));
    assert(s.loading() && !hooks.events.length && !s.get('app-loader-retry').hidden, 'Invalid reset link granted access');
  });
  await test('Session initialization shares one request and one auth subscription', async () => {
    let requests = 0, subscriptions = 0;
    const client = { auth: { async getSession() { requests++; return { data: { session: { user: { id: 'student' } } } }; }, onAuthStateChange() { subscriptions++; } } };
    const a = new Function('supabase', `${authSource}\nreturn auth;`)(client);
    assert(requests === 0, 'Constructor started an unawaited session request');
    await Promise.all([a.init(), a.init()]); await a.init();
    assert(requests === 1 && subscriptions === 1 && a.isAuthenticated, 'Session restored repeatedly');
  });
  await test('Failed session check can retry without duplicate subscriptions', async () => {
    let requests = 0, subscriptions = 0;
    const client = { auth: { async getSession() { requests++; return { data: { session: null }, error: requests === 1 ? new Error('Offline') : null }; }, onAuthStateChange() { subscriptions++; } } };
    const a = new Function('supabase', `${authSource}\nreturn auth;`)(client);
    let failed = false; try { await a.init(); } catch { failed = true; }
    await a.init(); assert(failed && requests === 2 && subscriptions === 1 && !a.isAuthenticated, 'Session error hidden or retry broken');
  });
  return passed;
}
module.exports = runTests;
if (require.main === module) runTests().then(passed => console.log(`${passed.length} startup checks passed.`)).catch(error => { console.error(error); process.exitCode = 1; });
