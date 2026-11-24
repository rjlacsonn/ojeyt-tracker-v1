// Run with PGLITE_MODULE pointing to an installed @electric-sql/pglite module.
// Uses an isolated in-memory PostgreSQL database; never connects to Supabase.
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

async function runTests() {
  if (!process.env.PGLITE_MODULE) {
    console.log('Super-admin database checks skipped: set PGLITE_MODULE to @electric-sql/pglite.');
    return [];
  }
  const { PGlite } = require(process.env.PGLITE_MODULE);
  const db = new PGlite();
  const passed = [];
  const root = path.join(__dirname, '..');
  const ids = Object.fromEntries(['super', 'admin', 'student', 'professor', 'candidate'].map((key, i) => [key, `00000000-0000-4000-8000-00000000000${i + 1}`]));
  const test = async (name, fn) => { await fn(); passed.push(name); };
  const actor = async name => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [ids[name]]);
    await db.exec('set role authenticated');
  };
  const denied = async sql => assert.rejects(() => db.exec(sql));
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}', banned_until timestamptz);
      create table auth.sessions(id uuid primary key default gen_random_uuid(), user_id uuid references auth.users on delete cascade);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text, metadata jsonb);
      alter table storage.objects enable row level security;
      create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1, '/') $$;
      grant usage on schema auth, storage, public to authenticated, anon;
      grant execute on function auth.uid(), storage.foldername(text) to authenticated, anon;
      grant all on storage.objects to authenticated;
      alter default privileges in schema public grant all on tables to authenticated;
    `);
    const migrations = ['schema', 'documents-migration', 'account-registration-migration',
      'student-approval-migration', 'professor-hours-migration', 'no-default-hours-migration',
      'student-progress-migration', 'short-coordinator-codes-migration', 'auto-approve-code-migration',
      'student-roster-management-migration', 'admin-migration', 'archived-review-cleanup-migration',
      'admin-document-requirements-migration', 'admin-badges-migration', 'lock-student-coordinator-migration',
      'student-profile-picture-migration', 'admin-account-deletion-migration', 'super-admin-migration'];
    for (const name of migrations) {
      try { await db.exec(fs.readFileSync(path.join(root, `supabase-${name}.sql`), 'utf8')); }
      catch (error) { throw new Error(`${name}: ${error.message}`, { cause: error }); }
    }
    for (const [name, id] of Object.entries(ids)) {
      await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)', [id, `${name}@example.edu`,
        { full_name: name, ...(name === 'professor' ? { account_type: 'professor', institution: 'School' } : {}) }]);
    }
    await db.query("insert into public.ojt_admins(user_id,admin_role) values($1,'super_admin'),($2,'admin')", [ids.super, ids.admin]);
    await db.query('insert into auth.sessions(user_id) values($1)', [ids.student]);

    await test('Regular admin cannot promote accounts or call either permanent-deletion RPC', async () => {
      await actor('admin');
      await denied("select public.ojt_super_admin_grant_admin('candidate@example.edu')");
      for (const rpc of ['ojt_admin_delete_account', 'ojt_admin_account_storage_paths']) {
        await denied(`select public.${rpc}('${ids.student}')`);
      }
    });
    await test('Regular admin can disable an unenrolled student and revoke existing access', async () => {
      await actor('admin');
      await db.exec(`select public.ojt_admin_set_account_access('${ids.student}', 'Disable user')`);
      await actor('student');
      const { rows } = await db.query('select public.ojt_account_context() as context');
      assert.equal(rows[0].context.status, 'disabled');
      assert.equal((await db.query('select * from public.profiles')).rows.length, 0);
      await denied('select public.ojt_document_context()');
      await db.exec('reset role');
      assert.equal((await db.query('select * from auth.sessions where user_id = $1', [ids.student])).rows.length, 0);
      assert.equal((await db.query('select * from public.profiles where id = $1', [ids.student])).rows.length, 1);
    });
    await test('Regular admin can restore a student and disable a professor', async () => {
      await actor('admin');
      await db.exec(`select public.ojt_admin_set_account_access('${ids.student}', 'Enable user')`);
      await db.exec(`select public.ojt_admin_set_account_access('${ids.professor}', 'Disable user')`);
      await actor('professor');
      await denied('select public.ojt_list_students()');
      await actor('student');
      assert.equal((await db.query('select * from public.profiles')).rows.length, 1);
      await db.exec('reset role');
      const code = (await db.query('select join_code from public.ojt_coordinators where user_id = $1', [ids.professor])).rows[0].join_code;
      await actor('student');
      await assert.rejects(() => db.query('select public.ojt_join_coordinator($1)', [code]));
    });
    await test('Regular admin cannot manage administrators or their own access', async () => {
      await actor('admin');
      for (const target of ['super', 'admin']) await denied(`select public.ojt_admin_set_account_access('${ids[target]}', 'Disable user')`);
      await denied(`select public.ojt_admin_set_account_access('${ids.super}', 'Remove admin access')`);
    });
    await test('Storage blocks regular-admin deletes even with another permissive policy', async () => {
      await db.exec('reset role');
      await db.exec(`create policy "Test storage select" on storage.objects for select to authenticated using(true);
        create policy "Test storage delete" on storage.objects for delete to authenticated using(true);
        insert into storage.objects(bucket_id,name) values('profile-pictures','permission-test.jpg');`);
      await actor('admin');
      assert.equal((await db.query("delete from storage.objects where name = 'permission-test.jpg' returning id")).rows.length, 0);
      await actor('super');
      assert.equal((await db.query("delete from storage.objects where name = 'permission-test.jpg' returning id")).rows.length, 1);
    });
    await test('Super admin can grant, disable, restore and remove admin access', async () => {
      await actor('super');
      assert.equal((await db.query('select public.ojt_account_context() as context')).rows[0].context.admin_role, 'super_admin');
      await db.exec("select public.ojt_super_admin_grant_admin('candidate@example.edu')");
      await db.exec(`select public.ojt_admin_set_account_access('${ids.candidate}', 'Disable user')`);
      await actor('candidate');
      await denied('select public.ojt_admin_overview()');
      await denied("select public.ojt_admin_set_requirement_active('application', false)");
      await actor('super');
      await db.exec(`select public.ojt_admin_set_account_access('${ids.candidate}', 'Enable user')`);
      await actor('candidate');
      assert.equal((await db.query('select public.ojt_account_context() as context')).rows[0].context.admin_role, 'admin');
      await actor('super');
      await db.exec(`select public.ojt_admin_set_account_access('${ids.candidate}', 'Remove admin access')`);
      await actor('candidate');
      await denied('select public.ojt_admin_overview()');
    });
    await test('Directory reports disabled professors and Super Admins accurately', async () => {
      await actor('super');
      const accounts = (await db.query('select public.ojt_admin_overview() as overview')).rows[0].overview.accounts;
      assert.equal(accounts.find(a => a.id === ids.super).role, 'Super Admin');
      assert.equal(accounts.find(a => a.id === ids.professor).disabled, true);
    });
    await test('Super admin permanently deletes a student and cascades the profile', async () => {
      await actor('super');
      await denied(`select public.ojt_admin_delete_account('${ids.super}')`);
      await db.exec('reset role');
      await db.query(`insert into public.ojt_documents(user_id,requirement_id,file_path,file_name,file_size,content_type,status)
        values($1,'application',$2,'form.pdf',100,'application/pdf','submitted')`, [ids.student, `${ids.student}/application/form.pdf`]);
      await actor('super');
      await db.exec(`select public.ojt_admin_delete_account('${ids.student}')`);
      await db.exec('reset role');
      assert.equal((await db.query('select * from auth.users where id = $1', [ids.student])).rows.length, 0);
      assert.equal((await db.query('select * from public.profiles where id = $1', [ids.student])).rows.length, 0);
      assert.equal((await db.query('select * from public.ojt_documents where user_id = $1', [ids.student])).rows.length, 0);
    });
    await test('Migration can be reapplied without losing roles or restrictions', async () => {
      await db.exec("select set_config('request.jwt.claim.sub', '', false)");
      await db.exec(fs.readFileSync(path.join(root, 'supabase-super-admin-migration.sql'), 'utf8'));
      await actor('admin');
      await denied(`select public.ojt_admin_delete_account('${ids.candidate}')`);
      await actor('super');
      assert.equal((await db.query('select public.ojt_account_context() as context')).rows[0].context.admin_role, 'super_admin');
    });
    return passed;
  } finally { await db.close(); }
}
module.exports = runTests;
if (require.main === module) runTests().then(passed => {
  if (passed.length) console.log(`${passed.length} super-admin PostgreSQL checks passed.`);
}).catch(error => { console.error(error); process.exitCode = 1; });
