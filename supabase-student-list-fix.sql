-- Run in Supabase SQL Editor after the student-approval migration.
-- Match every returned column to the declared type, including auth.users.email.
begin;
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
revoke all on function public.ojt_list_students() from public, anon;
grant execute on function public.ojt_list_students() to authenticated;
notify pgrst, 'reload schema';
commit;
