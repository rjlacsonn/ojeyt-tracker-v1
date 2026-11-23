-- Run after supabase-auto-approve-code-migration.sql.
-- Adds searchable roster completion data and safe removal of completed students.
-- Removal archives the enrollment only; accounts, shifts, and document history remain intact.
begin;

alter table public.ojt_enrollments
  add column if not exists archived_at timestamptz;

-- Archived students return to the coordinator-code screen. Their enrollment row
-- remains as history, but it no longer grants tracker or document access.
create or replace function public.ojt_student_is_approved()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.ojt_enrollments
    where student_id = auth.uid() and approval_status = 'approved' and archived_at is null
  ) and not public.ojt_is_coordinator();
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
  select * into enrollment from public.ojt_enrollments
  where student_id = auth.uid() and archived_at is null;
  select display_name into professor_name from public.ojt_coordinators where user_id = enrollment.coordinator_id;
  return jsonb_build_object('account_type', 'student',
    'status', case when enrollment.approval_status = 'approved' then 'active' else 'pending' end,
    'recipient_id', enrollment.coordinator_id, 'recipient_name', professor_name,
    'institution', '', 'department', '');
end;
$$;

create or replace function public.ojt_document_context()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare coordinator public.ojt_coordinators; recipient public.ojt_coordinators;
begin
  if auth.uid() is null then raise exception 'Sign in to access documents.'; end if;
  select * into coordinator from public.ojt_coordinators where user_id = auth.uid();
  select c.* into recipient from public.ojt_enrollments e join public.ojt_coordinators c
    on c.user_id = e.coordinator_id
    where e.student_id = auth.uid() and e.archived_at is null;
  return jsonb_build_object('is_coordinator', coordinator.user_id is not null,
    'join_code', coordinator.join_code, 'coordinator_name', coordinator.display_name,
    'recipient_id', recipient.user_id, 'recipient_name', recipient.display_name);
end;
$$;

create or replace function public.ojt_completed_requirement_count(p_student_id uuid, p_coordinator_id uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer
  from (
    select d.requirement_id
    from public.ojt_documents d
    where d.user_id = p_student_id and d.coordinator_id = p_coordinator_id
    group by d.requirement_id
    having bool_and(d.status = 'approved')
  ) completed;
$$;

revoke all on function public.ojt_completed_requirement_count(uuid, uuid) from public, anon, authenticated;

create or replace function public.ojt_student_is_complete(p_student_id uuid, p_coordinator_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.ojt_completed_requirement_count(p_student_id, p_coordinator_id) = 10
    and coalesce(p.required_hours, 0) > 0
    and coalesce((select sum(s.total_hours) from public.shifts s where s.user_id = p_student_id), 0) >= p.required_hours
  from public.profiles p where p.id = p_student_id;
$$;

revoke all on function public.ojt_student_is_complete(uuid, uuid) from public, anon, authenticated;

drop function if exists public.ojt_list_students();
create function public.ojt_list_students()
returns table(student_id uuid, full_name text, email text, approval_status text,
  requested_at timestamptz, approved_at timestamptz, required_hours integer,
  logged_hours numeric, approved_requirements integer, is_complete boolean)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.ojt_is_coordinator() then raise exception 'Professor access required.'; end if;
  return query select e.student_id::uuid, coalesce(p.full_name, '')::text,
    coalesce(u.email, '')::text, e.approval_status::text,
    e.created_at::timestamptz, e.approved_at::timestamptz,
    p.required_hours::integer, coalesce(progress.logged_hours, 0)::numeric,
    public.ojt_completed_requirement_count(e.student_id, e.coordinator_id)::integer,
    coalesce(public.ojt_student_is_complete(e.student_id, e.coordinator_id), false)::boolean
  from public.ojt_enrollments e join auth.users u on u.id = e.student_id
  left join public.profiles p on p.id = e.student_id
  left join lateral (
    select sum(s.total_hours)::numeric as logged_hours
    from public.shifts s where s.user_id = e.student_id
  ) progress on true
  where e.coordinator_id = auth.uid() and e.archived_at is null
  order by e.created_at desc;
end;
$$;

create or replace function public.ojt_archive_completed_student(p_student_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.ojt_is_coordinator() then raise exception 'Professor access required.'; end if;
  if not exists (
    select 1 from public.ojt_enrollments e
    where e.student_id = p_student_id and e.coordinator_id = auth.uid() and e.archived_at is null
  ) then raise exception 'This student is not in your active roster.'; end if;
  if not coalesce(public.ojt_student_is_complete(p_student_id, auth.uid()), false) then
    raise exception 'The student must complete all 10 document requirements and all assigned OJT hours before removal.';
  end if;
  update public.ojt_enrollments set archived_at = now()
  where student_id = p_student_id and coordinator_id = auth.uid() and archived_at is null;
end;
$$;

create or replace function public.ojt_archive_all_completed_students()
returns integer language plpgsql security definer set search_path = '' as $$
declare active_count integer;
begin
  if not public.ojt_is_coordinator() then raise exception 'Professor access required.'; end if;
  perform 1 from public.ojt_enrollments
  where coordinator_id = auth.uid() and archived_at is null for update;
  select count(*)::integer into active_count from public.ojt_enrollments
  where coordinator_id = auth.uid() and archived_at is null;
  if active_count = 0 then raise exception 'There are no active students to clear.'; end if;
  if exists (
    select 1 from public.ojt_enrollments e
    where e.coordinator_id = auth.uid() and e.archived_at is null
      and not coalesce(public.ojt_student_is_complete(e.student_id, e.coordinator_id), false)
  ) then raise exception 'Every active student must complete all 10 document requirements and assigned OJT hours before clearing the roster.';
  end if;
  update public.ojt_enrollments set archived_at = now()
  where coordinator_id = auth.uid() and archived_at is null;
  return active_count;
end;
$$;

-- Re-entering a valid professor code restores an archived enrollment.
create or replace function public.ojt_join_coordinator(p_code text)
returns void language plpgsql security definer set search_path = '' as $$
declare recipient uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if public.ojt_is_coordinator() then raise exception 'Professor accounts cannot enroll as students.'; end if;
  select user_id into recipient from public.ojt_coordinators where join_code = upper(trim(p_code));
  if recipient is null then raise exception 'Coordinator code not found.'; end if;
  insert into public.ojt_enrollments (student_id, coordinator_id, approval_status, approved_at, archived_at)
  values (auth.uid(), recipient, 'approved', now(), null)
  on conflict (student_id) do update set coordinator_id = excluded.coordinator_id,
    approval_status = 'approved', archived_at = null,
    approved_at = case when ojt_enrollments.coordinator_id = excluded.coordinator_id
      then coalesce(ojt_enrollments.approved_at, now()) else now() end,
    created_at = case when ojt_enrollments.coordinator_id = excluded.coordinator_id
      then ojt_enrollments.created_at else now() end;
end;
$$;

revoke all on function public.ojt_list_students() from public, anon;
revoke all on function public.ojt_archive_completed_student(uuid) from public, anon;
revoke all on function public.ojt_archive_all_completed_students() from public, anon;
revoke all on function public.ojt_join_coordinator(text) from public, anon;
revoke all on function public.ojt_student_is_approved() from public, anon;
revoke all on function public.ojt_account_context() from public, anon;
revoke all on function public.ojt_document_context() from public, anon;
grant execute on function public.ojt_list_students(),
  public.ojt_archive_completed_student(uuid),
  public.ojt_archive_all_completed_students(),
  public.ojt_join_coordinator(text),
  public.ojt_student_is_approved(),
  public.ojt_account_context(),
  public.ojt_document_context() to authenticated;

notify pgrst, 'reload schema';
commit;
