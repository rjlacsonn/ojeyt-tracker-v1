-- Apply after supabase-lock-student-coordinator-migration.sql.
-- Makes each student's existing public profile-picture URL available to their professor.
begin;

drop function if exists public.ojt_list_students();
create function public.ojt_list_students()
returns table(student_id uuid, full_name text, email text, approval_status text,
  requested_at timestamptz, approved_at timestamptz, required_hours integer,
  logged_hours numeric, approved_requirements integer, is_complete boolean,
  profile_picture_url text)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.ojt_is_coordinator() then raise exception 'Professor access required.'; end if;
  return query select e.student_id::uuid, coalesce(p.full_name, '')::text,
    coalesce(u.email, '')::text, e.approval_status::text,
    e.created_at::timestamptz, e.approved_at::timestamptz,
    p.required_hours::integer, coalesce(progress.logged_hours, 0)::numeric,
    public.ojt_completed_requirement_count(e.student_id, e.coordinator_id)::integer,
    coalesce(public.ojt_student_is_complete(e.student_id, e.coordinator_id), false)::boolean,
    p.profile_picture_url::text
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

revoke all on function public.ojt_list_students() from public, anon;
grant execute on function public.ojt_list_students() to authenticated;

notify pgrst, 'reload schema';
commit;
