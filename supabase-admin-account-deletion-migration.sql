-- Apply after the administrator migrations.
-- Adds irreversible, administrator-only account deletion and storage cleanup access.
begin;

alter table public.ojt_admin_events add column if not exists detail text;

create or replace function public.ojt_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.ojt_admins where user_id = auth.uid()
  );
$$;

create or replace function public.ojt_admin_account_storage_paths(p_user uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target_email text;
  document_paths jsonb;
  profile_picture_paths jsonb;
begin
  if not public.ojt_is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_user is null then raise exception 'Choose a user to delete.'; end if;
  if p_user = auth.uid() then
    raise exception 'You cannot delete the administrator account you are currently using.';
  end if;

  select u.email into target_email from auth.users u where u.id = p_user for update;
  if target_email is null then
    raise exception 'The account no longer exists. Refresh and try again.';
  end if;

  select coalesce(jsonb_agg(o.name order by o.name), '[]'::jsonb) into document_paths
  from storage.objects o
  where o.bucket_id = 'ojt-documents'
    and (storage.foldername(o.name))[1] = p_user::text;

  select coalesce(jsonb_agg(o.name order by o.name), '[]'::jsonb) into profile_picture_paths
  from storage.objects o
  where o.bucket_id = 'profile-pictures'
    and o.name like p_user::text || '-%';

  return jsonb_build_object(
    'document_paths', document_paths,
    'profile_picture_paths', profile_picture_paths
  );
end;
$$;

create or replace function public.ojt_admin_delete_account(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare target_email text;
begin
  if not public.ojt_is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_user is null then raise exception 'Choose a user to delete.'; end if;
  if p_user = auth.uid() then
    raise exception 'You cannot delete the administrator account you are currently using.';
  end if;

  select u.email into target_email from auth.users u where u.id = p_user for update;
  if target_email is null then
    raise exception 'The account no longer exists. Refresh and try again.';
  end if;

  -- Cascading foreign keys remove the profile, sessions, shifts, registration,
  -- enrollment, administrator/coordinator role, and student document records.
  delete from auth.users where id = p_user;
  if not found then raise exception 'The account changed. Refresh and try again.'; end if;

  -- Keep an audit entry without retaining the deleted user's UUID as the subject.
  insert into public.ojt_admin_events(actor, subject, action, detail)
  values(auth.uid(), auth.uid(), 'Permanently deleted user', target_email);
end;
$$;

revoke all on function public.ojt_is_admin(), public.ojt_admin_account_storage_paths(uuid),
  public.ojt_admin_delete_account(uuid) from public, anon;
grant execute on function public.ojt_is_admin(), public.ojt_admin_account_storage_paths(uuid),
  public.ojt_admin_delete_account(uuid) to authenticated;

-- The student-approval migration installs this as a RESTRICTIVE policy. Every
-- storage policy must pass it, so administrators need an explicit bypass here;
-- a separate permissive administrator policy is not enough by itself.
drop policy if exists "Approved participants use document storage" on storage.objects;
create policy "Approved participants use document storage" on storage.objects
  as restrictive for all to authenticated
  using (
    bucket_id <> 'ojt-documents'
    or public.ojt_student_is_approved()
    or public.ojt_is_coordinator()
    or public.ojt_is_admin()
  )
  with check (
    bucket_id <> 'ojt-documents'
    or public.ojt_student_is_approved()
    or public.ojt_is_coordinator()
    or public.ojt_is_admin()
  );

-- Cascading deletion of a student's document rows invokes this trigger too.
-- Administrators must not be mistaken for unapproved students during deletion.
create or replace function public.require_ojt_student_approval()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null
    and not public.ojt_is_admin()
    and not public.ojt_is_coordinator()
    and not public.ojt_student_is_approved()
  then
    raise exception 'Enter your professor''s coordinator code before using this feature.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.require_ojt_student_approval() from public, anon, authenticated;

-- The browser removes the physical objects through the Storage API before it
-- calls the final account-deletion RPC. Only administrators may do so.
drop policy if exists "Administrators delete user OJT files" on storage.objects;
create policy "Administrators delete user OJT files" on storage.objects
  for delete to authenticated using (
    bucket_id = 'ojt-documents' and public.ojt_is_admin()
  );

drop policy if exists "Administrators delete user profile pictures" on storage.objects;
create policy "Administrators delete user profile pictures" on storage.objects
  for delete to authenticated using (
    bucket_id = 'profile-pictures' and public.ojt_is_admin()
  );

notify pgrst, 'reload schema';
commit;
