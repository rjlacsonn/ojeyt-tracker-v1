-- Run after the existing Supabase migrations.
-- A valid professor code now enrolls and activates a student immediately.
begin;

alter table public.ojt_enrollments
  alter column approval_status set default 'approved';

-- Activate requests created by the previous manual-approval flow.
update public.ojt_enrollments
set approval_status = 'approved', approved_at = coalesce(approved_at, now())
where approval_status = 'pending';

create or replace function public.ojt_join_coordinator(p_code text)
returns void language plpgsql security definer set search_path = '' as $$
declare recipient uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if public.ojt_is_coordinator() then raise exception 'Professor accounts cannot enroll as students.'; end if;
  select user_id into recipient from public.ojt_coordinators where join_code = upper(trim(p_code));
  if recipient is null then raise exception 'Coordinator code not found.'; end if;
  insert into public.ojt_enrollments (student_id, coordinator_id, approval_status, approved_at)
  values (auth.uid(), recipient, 'approved', now())
  on conflict (student_id) do update set coordinator_id = excluded.coordinator_id,
    approval_status = 'approved',
    approved_at = case when ojt_enrollments.coordinator_id = excluded.coordinator_id
      then coalesce(ojt_enrollments.approved_at, now()) else now() end,
    created_at = case when ojt_enrollments.coordinator_id = excluded.coordinator_id
      then ojt_enrollments.created_at else now() end;
end;
$$;

revoke all on function public.ojt_join_coordinator(text) from public, anon;
grant execute on function public.ojt_join_coordinator(text) to authenticated;

notify pgrst, 'reload schema';
commit;
