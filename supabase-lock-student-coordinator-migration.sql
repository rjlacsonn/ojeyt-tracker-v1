-- Apply after supabase-admin-badges-migration.sql.
-- Students may join when unconnected, but cannot replace an active coordinator.
-- An administrator must disconnect the enrollment first; archived students may reconnect.
begin;

create or replace function public.ojt_join_coordinator(p_code text)
returns void language plpgsql security definer set search_path = '' as $$
declare recipient uuid; existing public.ojt_enrollments;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if public.ojt_is_coordinator() then raise exception 'Professor accounts cannot enroll as students.'; end if;
  select user_id into recipient from public.ojt_coordinators where join_code = upper(trim(p_code));
  if recipient is null then raise exception 'Coordinator code not found.'; end if;

  select * into existing from public.ojt_enrollments where student_id = auth.uid() for update;
  if existing.student_id is not null and existing.archived_at is null then
    if existing.coordinator_id = recipient then return; end if;
    raise exception 'Your coordinator is already assigned. Contact your professor or administrator to request a change.'
      using errcode = '42501';
  end if;

  insert into public.ojt_enrollments
    (student_id, coordinator_id, approval_status, approved_at, archived_at)
  values (auth.uid(), recipient, 'approved', now(), null)
  on conflict (student_id) do update set coordinator_id = excluded.coordinator_id,
    approval_status = 'approved', archived_at = null, approved_at = now(), created_at = now();
end;
$$;

revoke all on function public.ojt_join_coordinator(text) from public, anon;
grant execute on function public.ojt_join_coordinator(text) to authenticated;

notify pgrst, 'reload schema';
commit;
