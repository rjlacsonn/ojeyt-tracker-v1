-- Run after supabase-super-admin-migration.sql.
-- Both administrator roles can correct student coordinator assignments.
begin;

create or replace function public.ojt_admin_change_coordinator(
  p_student uuid, p_coordinator uuid, p_expected_coordinator uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  existing public.ojt_enrollments;
  active_coordinator uuid;
  student_email text;
  replacement_name text;
  previous_name text;
begin
  if not public.ojt_is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_student is null or p_coordinator is null or p_student = p_coordinator then
    raise exception 'Choose a student and a different coordinator.';
  end if;
  -- Coordinate with account disabling/deletion and concurrent reassignment.
  perform id from auth.users where id in (p_student, p_coordinator) order by id for update;
  select email into student_email from auth.users where id = p_student;
  if not found or exists(select 1 from public.ojt_admins where user_id = p_student)
    or exists(select 1 from public.ojt_coordinators where user_id = p_student) then
    raise exception 'Only student accounts can be reassigned.';
  end if;
  if exists(select 1 from public.ojt_disabled_accounts where user_id in (p_student, p_coordinator)) then
    raise exception 'Enable the student and coordinator accounts before changing the assignment.';
  end if;
  select display_name into replacement_name from public.ojt_coordinators where user_id = p_coordinator;
  if not found or exists(select 1 from public.ojt_admins where user_id = p_coordinator) then
    raise exception 'Choose an enabled professor account as the coordinator.';
  end if;

  select * into existing from public.ojt_enrollments where student_id = p_student for update;
  active_coordinator := case when existing.archived_at is null then existing.coordinator_id else null end;
  if active_coordinator is distinct from p_expected_coordinator then
    raise exception 'The student''s coordinator changed. Refresh Administration and try again.';
  end if;
  if active_coordinator = p_coordinator then raise exception 'This coordinator is already assigned.'; end if;
  select display_name into previous_name from public.ojt_coordinators where user_id = existing.coordinator_id;

  insert into public.ojt_enrollments(student_id, coordinator_id, approval_status, approved_at, archived_at)
    values(p_student, p_coordinator, 'approved', now(), null)
  on conflict(student_id) do update set coordinator_id = excluded.coordinator_id,
    approval_status = 'approved', approved_at = now(), archived_at = null, created_at = now();

  -- Transfer this enrollment's submissions without changing review decisions,
  -- feedback, files, timestamps, shifts or the student's assigned hour target.
  update public.ojt_documents set coordinator_id = p_coordinator
    where user_id = p_student and coordinator_id = existing.coordinator_id;

  insert into public.ojt_admin_events(actor, subject, action, detail)
    values(auth.uid(), p_student, 'Changed student coordinator',
      student_email || ': ' || coalesce(previous_name, 'Unconnected') || ' → ' || replacement_name);
end;
$$;
revoke all on function public.ojt_admin_change_coordinator(uuid, uuid, uuid) from public, anon;
grant execute on function public.ojt_admin_change_coordinator(uuid, uuid, uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
