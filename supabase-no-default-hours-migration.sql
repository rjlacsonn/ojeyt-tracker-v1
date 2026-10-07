-- Run after supabase-student-approval-migration.sql. Includes professor hour controls and the student-list fix.
begin;
alter table public.profiles alter column required_hours drop not null;
alter table public.profiles alter column required_hours drop default;
alter table public.profiles add column if not exists required_hours_assigned_at timestamptz;

-- Older targets have no record proving a professor allocated them. Clear these
-- unverified targets once, so every student starts unassigned. Reruns preserve
-- allocations made by the professor RPC below. Shifts and logged hours are preserved.
update public.profiles set required_hours = null where required_hours_assigned_at is null;

-- New students have no target; signup metadata cannot allocate hours.
create or replace function public.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, email, required_hours)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), coalesce(new.email, ''), null)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Enforce this rule even for direct REST updates and older clients.
create or replace function public.guard_ojt_required_hours()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.required_hours := null;
    new.required_hours_assigned_at := null;
  elsif (new.required_hours is distinct from old.required_hours
      or new.required_hours_assigned_at is distinct from old.required_hours_assigned_at)
      and auth.uid() is not null then
    if not exists (
      select 1 from public.ojt_coordinators c join public.ojt_enrollments e on e.coordinator_id = c.user_id
      where c.user_id = auth.uid() and e.student_id = new.id
    ) then
      raise exception 'Only the student''s professor or OJT coordinator can change required hours.';
    end if;
    if new.required_hours is null or new.required_hours not between 1 and 10000 then
      raise exception 'Required OJT hours must be between 1 and 10,000.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_ojt_required_hours on public.profiles;
create trigger guard_ojt_required_hours before insert or update on public.profiles
  for each row execute function public.guard_ojt_required_hours();

create or replace function public.ojt_set_student_hours(p_student_id uuid, p_hours integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.ojt_is_coordinator() then raise exception 'Professor access required.'; end if;
  if p_hours is null or p_hours not between 1 and 10000 then
    raise exception 'Required OJT hours must be between 1 and 10,000.';
  end if;
  -- Lock the enrollment so it cannot change professors while hours are being saved.
  perform 1 from public.ojt_enrollments
    where student_id = p_student_id and coordinator_id = auth.uid() for update;
  if not found then raise exception 'You can only allocate hours for students enrolled with you.'; end if;
  update public.profiles set required_hours = p_hours, required_hours_assigned_at = now() where id = p_student_id;
  if not found then raise exception 'Student profile not found. Refresh the list and try again.'; end if;
end;
$$;

-- The return signature gains required_hours, so recreate this read-only RPC.
drop function if exists public.ojt_list_students();
create function public.ojt_list_students()
returns table(student_id uuid, full_name text, email text, approval_status text, requested_at timestamptz, approved_at timestamptz, required_hours integer)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.ojt_is_coordinator() then raise exception 'Professor access required.'; end if;
  return query select e.student_id::uuid, coalesce(p.full_name, '')::text,
    coalesce(u.email, '')::text, e.approval_status::text,
    e.created_at::timestamptz, e.approved_at::timestamptz, p.required_hours::integer
  from public.ojt_enrollments e join auth.users u on u.id = e.student_id
  left join public.profiles p on p.id = e.student_id
  where e.coordinator_id = auth.uid() order by e.created_at desc;
end;
$$;
revoke all on function public.guard_ojt_required_hours(), public.create_profile_for_new_user() from public, anon, authenticated;
revoke all on function public.ojt_set_student_hours(uuid, integer), public.ojt_list_students() from public, anon;
grant execute on function public.ojt_set_student_hours(uuid, integer), public.ojt_list_students() to authenticated;
notify pgrst, 'reload schema';
commit;
