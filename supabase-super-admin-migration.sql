-- Run LAST, after supabase-admin-account-deletion-migration.sql.
-- Existing administrators remain regular administrators. Appoint the first
-- super administrator explicitly from SQL Editor (see SUPABASE_SETUP.md).
begin;

alter table public.ojt_admins add column if not exists admin_role text not null default 'admin'
  check (admin_role in ('admin', 'super_admin'));
create table if not exists public.ojt_disabled_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  disabled_at timestamptz not null default now(),
  disabled_by uuid not null
);
alter table public.ojt_disabled_accounts enable row level security;
revoke all on public.ojt_disabled_accounts from public, anon, authenticated;

create or replace function public.ojt_account_enabled()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists(select 1 from auth.users where id = auth.uid())
    and not exists(select 1 from public.ojt_disabled_accounts where user_id = auth.uid());
$$;
create or replace function public.ojt_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.ojt_account_enabled() and exists(
    select 1 from public.ojt_admins where user_id = auth.uid());
$$;
create or replace function public.ojt_is_super_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.ojt_account_enabled() and exists(
    select 1 from public.ojt_admins where user_id = auth.uid() and admin_role = 'super_admin');
$$;
create or replace function public.ojt_is_coordinator()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.ojt_account_enabled() and exists(
    select 1 from public.ojt_coordinators where user_id = auth.uid());
$$;
create or replace function public.ojt_student_is_approved()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.ojt_account_enabled() and exists(
    select 1 from public.ojt_enrollments e
    where e.student_id = auth.uid() and e.approval_status = 'approved' and e.archived_at is null
  ) and not public.ojt_is_coordinator();
$$;

-- Preserve installed context/overview definitions, including all prior migrations.
-- Private copies are not callable by the browser. Reapplication is safe.
do $$
declare source text;
begin
  if to_regprocedure('public.ojt_account_context_before_super_admin()') is null then
    source := pg_get_functiondef('public.ojt_account_context()'::regprocedure);
    execute replace(source, 'public.ojt_account_context(', 'public.ojt_account_context_before_super_admin(');
  end if;
  if to_regprocedure('public.ojt_admin_overview_before_super_admin()') is null then
    source := pg_get_functiondef('public.ojt_admin_overview()'::regprocedure);
    execute replace(source, 'public.ojt_admin_overview(', 'public.ojt_admin_overview_before_super_admin(');
  end if;
end $$;
revoke all on function public.ojt_account_context_before_super_admin(),
  public.ojt_admin_overview_before_super_admin() from public, anon, authenticated;

create or replace function public.ojt_account_context()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.ojt_account_enabled() then return jsonb_build_object('status', 'disabled'); end if;
  if public.ojt_is_admin() then
    return jsonb_build_object('account_type', 'admin', 'status', 'active',
      'admin_role', case when public.ojt_is_super_admin() then 'super_admin' else 'admin' end);
  end if;
  return public.ojt_account_context_before_super_admin();
end $$;

create or replace function public.ojt_admin_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.ojt_is_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  result := public.ojt_admin_overview_before_super_admin();
  return jsonb_set(result, '{accounts}', coalesce((
    select jsonb_agg(item || jsonb_build_object(
      'role', case when a.admin_role = 'super_admin' then 'Super Admin' else item->>'role' end,
      'disabled', d.user_id is not null) order by item->>'name', item->>'email')
    from jsonb_array_elements(result->'accounts') item
    left join public.ojt_admins a on a.user_id = (item->>'id')::uuid
    left join public.ojt_disabled_accounts d on d.user_id = (item->>'id')::uuid
  ), '[]'::jsonb));
end $$;

create or replace function public.ojt_admin_set_account_access(p_user uuid, p_action text)
returns void language plpgsql security definer set search_path = '' as $$
declare target_email text; target_role text;
begin
  if not public.ojt_is_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'You cannot change your own account access.'; end if;
  -- Serialize role/status changes, promotions, and deletion of the same target.
  select email into target_email from auth.users where id = p_user for update;
  if not found then raise exception 'Account not found. Refresh and try again.'; end if;
  select admin_role into target_role from public.ojt_admins where user_id = p_user;
  if target_role = 'super_admin' then raise exception 'Super administrator accounts must be managed in SQL Editor.'; end if;
  if target_role is not null and not public.ojt_is_super_admin() then
    raise exception 'Only a super administrator can manage administrators.' using errcode = '42501';
  end if;
  if p_action = 'Disable user' then
    insert into public.ojt_disabled_accounts(user_id, disabled_by) values(p_user, auth.uid())
      on conflict(user_id) do nothing;
    -- Prevent new logins/refreshes. RLS and RPC guards also block existing JWTs.
    update auth.users set banned_until = now() + interval '100 years' where id = p_user;
    delete from auth.sessions where user_id = p_user;
  elsif p_action = 'Enable user' then
    delete from public.ojt_disabled_accounts where user_id = p_user;
    update auth.users set banned_until = null where id = p_user;
  elsif p_action = 'Remove admin access' then
    if not public.ojt_is_super_admin() then raise exception 'Super administrator access required' using errcode = '42501'; end if;
    delete from public.ojt_admins where user_id = p_user and admin_role = 'admin';
    if not found then raise exception 'This account is not an administrator.'; end if;
  else raise exception 'Unknown access action.';
  end if;
  insert into public.ojt_admin_events(actor, subject, action, detail)
    values(auth.uid(), p_user, p_action, target_email);
end $$;

create or replace function public.ojt_super_admin_grant_admin(p_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare target_id uuid;
begin
  if not public.ojt_is_super_admin() then raise exception 'Super administrator access required' using errcode = '42501'; end if;
  select id into target_id from auth.users where lower(email) = lower(trim(p_email)) for update;
  if not found then raise exception 'No account has that email. Register the account first.'; end if;
  if exists(select 1 from public.ojt_disabled_accounts where user_id = target_id) then
    raise exception 'Enable this account before granting administrator access.';
  end if;
  if exists(select 1 from public.ojt_admins where user_id = target_id) then raise exception 'This account is already an administrator.'; end if;
  insert into public.ojt_admins(user_id, admin_role) values(target_id, 'admin');
  insert into public.ojt_admin_events(actor, subject, action, detail)
    values(auth.uid(), target_id, 'Added administrator', trim(p_email));
end $$;

create or replace function public.ojt_admin_manage(p_action text, p_user uuid, p_coordinator uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.ojt_is_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  perform 1 from auth.users where id = p_user for update;
  if exists(select 1 from public.ojt_admins where user_id = p_user) then
    raise exception 'Use administrator account management for this account.';
  end if;
  if p_action = 'Reset coordinator code' then
    update public.ojt_coordinators set join_code = default where user_id = p_user;
  elsif p_action = 'Disconnect enrollment' then
    update public.ojt_enrollments set archived_at = now() where student_id = p_user
      and coordinator_id = p_coordinator and archived_at is null;
  else raise exception 'Unknown administrative action'; end if;
  if not found then raise exception 'Account or enrollment changed. Refresh and try again.'; end if;
  insert into public.ojt_admin_events(actor, subject, action) values(auth.uid(), p_user, p_action);
end $$;

-- Enforce disabled state on existing table APIs, even with an unexpired JWT.
do $$
declare target text;
begin
  foreach target in array array['profiles', 'shifts', 'ojt_sessions', 'ojt_documents',
    'ojt_enrollments', 'ojt_coordinators', 'ojt_professor_requests',
    'ojt_document_requirements', 'ojt_badge_definitions'] loop
    execute format('drop policy if exists "Enabled accounts only" on public.%I', target);
    execute format('create policy "Enabled accounts only" on public.%I as restrictive for all to authenticated using (public.ojt_account_enabled()) with check (public.ojt_account_enabled())', target);
    execute format('drop policy if exists "Administrator deletion requires super admin" on public.%I', target);
    execute format('create policy "Administrator deletion requires super admin" on public.%I as restrictive for delete to authenticated using (not public.ojt_is_admin() or public.ojt_is_super_admin())', target);
  end loop;
end $$;
drop policy if exists "Enabled accounts only" on storage.objects;
create policy "Enabled accounts only" on storage.objects as restrictive for all to authenticated
  using (public.ojt_account_enabled()) with check (public.ojt_account_enabled());

-- Existing SECURITY DEFINER RPCs bypass RLS. Add the enabled-account guard to
-- every authenticated PL/pgSQL RPC installed by this project, preserving its
-- original body and return type. The marker makes this safe to rerun.
do $$
declare fn record; source text; guard text;
begin
  for fn in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    join pg_language l on l.oid = p.prolang
    where n.nspname = 'public' and p.prosecdef and l.lanname = 'plpgsql'
      and p.proname like 'ojt_%' and p.proname <> 'ojt_account_context'
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
  loop
    source := pg_get_functiondef(fn.oid);
    if position('-- enabled-account-guard' in source) = 0 then
      guard := E'BEGIN\n  -- enabled-account-guard\n  if not public.ojt_account_enabled() then raise exception ''Account disabled. Contact the system administrator.'' using errcode = ''42501''; end if;\n';
      source := regexp_replace(source, '\mBEGIN\M', guard, 'i');
      execute source;
    end if;
  end loop;
end $$;

-- Hard deletion and the file-path preparation RPC are super-admin-only.
do $$
declare signature regprocedure; source text;
begin
  foreach signature in array array['public.ojt_admin_delete_account(uuid)'::regprocedure,
    'public.ojt_admin_account_storage_paths(uuid)'::regprocedure] loop
    source := pg_get_functiondef(signature);
    if position('-- super-admin-delete-guard' in source) = 0 then
      source := regexp_replace(source, '\mBEGIN\M', E'BEGIN\n  -- super-admin-delete-guard\n  if not public.ojt_is_super_admin() then raise exception ''Super administrator access required'' using errcode = ''42501''; end if;\n  perform 1 from auth.users where id = p_user for update;\n  if exists(select 1 from public.ojt_admins where user_id = p_user and admin_role = ''super_admin'') then raise exception ''Super administrator accounts cannot be deleted here.''; end if;\n', 'i');
      execute source;
    end if;
  end loop;
end $$;

-- Restrict every Storage DELETE for admins too, including permissive policies
-- installed outside this repository (e.g. the public profile-picture bucket).
drop policy if exists "Administrator deletion requires super admin" on storage.objects;
create policy "Administrator deletion requires super admin" on storage.objects
  as restrictive for delete to authenticated
  using (not public.ojt_is_admin() or public.ojt_is_super_admin());
drop policy if exists "Administrators delete user OJT files" on storage.objects;
create policy "Administrators delete user OJT files" on storage.objects
  for delete to authenticated using(bucket_id = 'ojt-documents' and public.ojt_is_super_admin());
drop policy if exists "Administrators delete user profile pictures" on storage.objects;
create policy "Administrators delete user profile pictures" on storage.objects
  for delete to authenticated using(bucket_id = 'profile-pictures' and public.ojt_is_super_admin());

-- A disabled professor's join code must not accept new student connections.
create or replace function public.ojt_require_enabled_coordinator()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.archived_at is null and exists(select 1 from public.ojt_disabled_accounts where user_id = new.coordinator_id) then
    raise exception 'This coordinator account is disabled. Contact your system administrator.';
  end if;
  return new;
end $$;
revoke all on function public.ojt_require_enabled_coordinator() from public, anon, authenticated;
drop trigger if exists require_enabled_coordinator on public.ojt_enrollments;
create trigger require_enabled_coordinator before insert or update of coordinator_id on public.ojt_enrollments
  for each row execute function public.ojt_require_enabled_coordinator();

revoke all on function public.ojt_account_enabled(), public.ojt_is_super_admin(),
  public.ojt_admin_set_account_access(uuid, text), public.ojt_super_admin_grant_admin(text) from public, anon;
grant execute on function public.ojt_account_enabled(), public.ojt_is_super_admin(),
  public.ojt_admin_set_account_access(uuid, text), public.ojt_super_admin_grant_admin(text) to authenticated;
notify pgrst, 'reload schema';
commit;
