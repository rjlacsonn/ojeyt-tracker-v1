-- Run AFTER supabase-account-registration-migration.sql.
-- Professors activate on registration. Students need approval from their chosen professor.
begin;
alter table public.ojt_enrollments add column if not exists approval_status text not null default 'pending'
  check (approval_status in ('pending', 'approved'));
alter table public.ojt_enrollments add column if not exists approved_at timestamptz;

-- Activate existing professor registrations, including accounts previously waiting for approval.
insert into public.ojt_coordinators (user_id, display_name)
select user_id, full_name from public.ojt_professor_requests
on conflict (user_id) do nothing;

create or replace function public.capture_ojt_professor_registration()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.raw_user_meta_data->>'account_type' = 'professor' then
    insert into public.ojt_professor_requests (user_id, full_name, email, institution, department)
    values (new.id, trim(coalesce(new.raw_user_meta_data->>'full_name', '')), coalesce(new.email, ''),
      trim(coalesce(new.raw_user_meta_data->>'institution', '')), trim(coalesce(new.raw_user_meta_data->>'department', '')));
    insert into public.ojt_coordinators (user_id, display_name)
    values (new.id, trim(new.raw_user_meta_data->>'full_name'));
  end if;
  return new;
end;
$$;

create or replace function public.ojt_is_coordinator()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.ojt_coordinators where user_id = auth.uid());
$$;
create or replace function public.ojt_student_is_approved()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.ojt_enrollments where student_id = auth.uid() and approval_status = 'approved')
    and not public.ojt_is_coordinator();
$$;

create or replace function public.ojt_account_context()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare registration public.ojt_professor_requests; enrollment public.ojt_enrollments; professor_name text;
begin
  if auth.uid() is null then raise exception 'Sign in to confirm your account access.'; end if;
  select * into registration from public.ojt_professor_requests where user_id = auth.uid();
  if public.ojt_is_coordinator() then
    return jsonb_build_object('account_type', 'professor', 'status', 'active',
      'institution', coalesce(registration.institution, ''), 'department', coalesce(registration.department, ''));
  end if;
  select * into enrollment from public.ojt_enrollments where student_id = auth.uid();
  select display_name into professor_name from public.ojt_coordinators where user_id = enrollment.coordinator_id;
  return jsonb_build_object('account_type', 'student',
    'status', case when enrollment.approval_status = 'approved' then 'active' else 'pending' end,
    'recipient_id', enrollment.coordinator_id, 'recipient_name', professor_name,
    'institution', '', 'department', '');
end;
$$;

create or replace function public.ojt_join_coordinator(p_code text)
returns void language plpgsql security definer set search_path = '' as $$
declare recipient uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if public.ojt_is_coordinator() then raise exception 'Professor accounts cannot enroll as students.'; end if;
  select user_id into recipient from public.ojt_coordinators where join_code = upper(trim(p_code));
  if recipient is null then raise exception 'Coordinator code not found.'; end if;
  insert into public.ojt_enrollments (student_id, coordinator_id) values (auth.uid(), recipient)
  on conflict (student_id) do update set coordinator_id = excluded.coordinator_id,
    approval_status = case when ojt_enrollments.coordinator_id = excluded.coordinator_id then ojt_enrollments.approval_status else 'pending' end,
    approved_at = case when ojt_enrollments.coordinator_id = excluded.coordinator_id then ojt_enrollments.approved_at else null end,
    created_at = case when ojt_enrollments.coordinator_id = excluded.coordinator_id then ojt_enrollments.created_at else now() end;
end;
$$;

create or replace function public.ojt_list_students()
returns table(student_id uuid, full_name text, email text, approval_status text, requested_at timestamptz, approved_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.ojt_is_coordinator() then raise exception 'Professor access required.'; end if;
  return query select e.student_id::uuid, coalesce(p.full_name, '')::text,
    coalesce(u.email, '')::text, e.approval_status::text,
    e.created_at::timestamptz, e.approved_at::timestamptz
  from public.ojt_enrollments e join auth.users u on u.id = e.student_id
  left join public.profiles p on p.id = e.student_id
  where e.coordinator_id = auth.uid() order by e.created_at desc;
end;
$$;
create or replace function public.ojt_approve_student(p_student_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.ojt_is_coordinator() then raise exception 'Professor access required.'; end if;
  update public.ojt_enrollments set approval_status = 'approved', approved_at = now()
    where student_id = p_student_id and coordinator_id = auth.uid() and approval_status = 'pending';
  if not found then raise exception 'This student is unavailable or already approved. Refresh the list.'; end if;
end;
$$;

-- Pending students can read their profile and request approval, but cannot use the tracker or files.
drop policy if exists "Approved students use shifts" on public.shifts;
create policy "Approved students use shifts" on public.shifts as restrictive for all to authenticated
  using (public.ojt_student_is_approved()) with check (public.ojt_student_is_approved());
drop policy if exists "Approved students use sessions" on public.ojt_sessions;
create policy "Approved students use sessions" on public.ojt_sessions as restrictive for all to authenticated
  using (public.ojt_student_is_approved()) with check (public.ojt_student_is_approved());
drop policy if exists "Approved participants use documents" on public.ojt_documents;
create policy "Approved participants use documents" on public.ojt_documents as restrictive for all to authenticated
  using (public.ojt_student_is_approved() or public.ojt_is_coordinator())
  with check (public.ojt_student_is_approved() or public.ojt_is_coordinator());
drop policy if exists "Approved participants use document storage" on storage.objects;
create policy "Approved participants use document storage" on storage.objects as restrictive for all to authenticated
  using (bucket_id <> 'ojt-documents' or public.ojt_student_is_approved() or public.ojt_is_coordinator())
  with check (bucket_id <> 'ojt-documents' or public.ojt_student_is_approved() or public.ojt_is_coordinator());

-- SECURITY DEFINER document RPCs also need to respect approval when they write.
create or replace function public.require_ojt_student_approval()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.ojt_is_coordinator() and not public.ojt_student_is_approved() then
    raise exception 'Your professor must approve your student account before you can use this feature.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists require_student_approval on public.ojt_documents;
create trigger require_student_approval before insert or update or delete on public.ojt_documents
  for each row execute function public.require_ojt_student_approval();

revoke all on function public.ojt_is_coordinator(), public.ojt_student_is_approved(),
  public.ojt_list_students(), public.ojt_approve_student(uuid) from public, anon;
revoke all on function public.require_ojt_student_approval() from public, anon, authenticated;
grant execute on function public.ojt_is_coordinator(), public.ojt_student_is_approved(),
  public.ojt_list_students(), public.ojt_approve_student(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
