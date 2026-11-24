const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

async function runTests() {
  const passed = [];
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const test = async (name, fn) => { await fn(); passed.push(name); };
  const admin = read('public/js/admin.js');
  const badgeAdmin = read('public/js/admin-badges.js');
  const html = read('public/index.html');
  const layout = read('public/css/layout.css');
  const migration = read('supabase-admin-account-deletion-migration.sql');

  await test('Account directory exposes permanent deletion but protects the active admin', () => {
    assert(admin.includes('data-action="Delete user"'), 'Delete user action is missing');
    assert(admin.includes("account.id === currentUser?.id"), 'Current administrator is not protected');
    assert(admin.includes('Current account'), 'Self-deletion protection is not explained');
  });

  await test('Permanent deletion requires typed email confirmation', () => {
    assert(html.includes('id="admin-delete-confirm-input"') && html.includes('id="admin-delete-confirm-apply"'), 'Confirmation controls are missing');
    assert(html.includes('Delete user permanently') && html.includes('This action cannot be undone.'), 'Irreversible action warning is unclear');
    assert(admin.includes("value.trim().toLowerCase()") && admin.includes("returnValue === 'delete'"), 'Typed email is not checked before deletion');
  });

  await test('Database operation is admin-only and cannot delete its caller', () => {
    assert(migration.includes('if not public.ojt_is_admin()'), 'RPC has no administrator authorization check');
    assert(migration.includes('if p_user = auth.uid()'), 'RPC permits self-deletion');
    assert(migration.includes('delete from auth.users where id = p_user'), 'Authentication identity is not deleted');
    assert(migration.includes('public.ojt_admin_account_storage_paths(uuid)') && migration.includes('to authenticated'), 'RPC permissions are incomplete');
  });

  await test('Linked records and physical storage are covered', () => {
    assert(migration.includes("bucket_id = 'ojt-documents'") && migration.includes("bucket_id = 'profile-pictures'"), 'Storage paths are not collected');
    assert(admin.includes("removeStoredFiles('ojt-documents'") && admin.includes("removeStoredFiles('profile-pictures'"), 'Storage API cleanup is missing');
    assert(admin.indexOf("rpc('ojt_admin_account_storage_paths'") < admin.indexOf("rpc('ojt_admin_delete_account'"), 'Account is deleted before owned storage');
    assert(admin.includes('some uploaded files could not be removed'), 'Partial cleanup is not reported');
  });

  await test('Professor approval restrictions explicitly allow administrators', () => {
    const restrictivePolicy = migration.slice(
      migration.indexOf('create policy "Approved participants use document storage"'),
      migration.indexOf('-- Cascading deletion')
    );
    const approvalTrigger = migration.slice(
      migration.indexOf('create or replace function public.require_ojt_student_approval()'),
      migration.indexOf('-- The browser removes')
    );
    assert(restrictivePolicy.includes('or public.ojt_is_admin()'), 'Restrictive storage policy still blocks administrators');
    assert(approvalTrigger.includes('and not public.ojt_is_admin()'), 'Document deletion trigger still treats administrators as students');
  });

  await test('Admin results use a simple lower-right notification', () => {
    assert(admin.includes("el('status').textContent = '';\n      if (message) showToast(message);"), 'Account actions still render completion text inline');
    assert(badgeAdmin.includes("if (message) showToast(message);"), 'Badge actions still render completion text inline');
    assert(layout.includes('right: max(20px, env(safe-area-inset-right));') && !layout.includes('transform: translateX(-50%)'), 'Toast is not positioned at the lower right');
    assert(html.includes('aria-live="polite"'), 'Toast updates are not announced accessibly');
  });

  return passed;
}

module.exports = runTests;
if (require.main === module) runTests()
  .then(passed => console.log(`${passed.length} administrator account deletion checks passed.`))
  .catch(error => { console.error(error); process.exitCode = 1; });
