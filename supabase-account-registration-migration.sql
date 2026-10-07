-- Run after supabase-documents-migration.sql.
-- Registration declares intent. Only administrator-managed coordinator records grant review access.
begin;
create table if not exists public.ojt_professor_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (length(trim(full_name)) between 1 and 160),
  email text not null,
  institution text not null check (length(trim(institution)) between 1 and 160),
  department text not null default '' check (length(department) <= 160),
  created_at timestamptz not null default now()
);
alter table public.ojt_professor_requests enable row level security;
revoke all on public.ojt_professor_requests from public, anon, authenticated;
grant select on public.ojt_professor_requests to authenticated;
drop policy if exists "Professor reads own registration request" on public.ojt_professor_requests;
create policy "Professor reads own registration request" on public.ojt_professor_requests
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.capture_ojt_professor_registration()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.raw_user_meta_data->>'account_type' = 'professor' then
    insert into public.ojt_professor_requests (user_id, full_name, email, institution, department)
    values (new.id, trim(coalesce(new.raw_user_meta_data->>'full_name', '')),
      coalesce(new.email, ''), trim(coalesce(new.raw_user_meta_data->>'institution', '')),
      trim(coalesce(new.raw_user_meta_data->>'department', '')));
  end if;
  return new;
end;
$$;
drop trigger if exists capture_ojt_professor_registration on auth.users;
create trigger capture_ojt_professor_registration after insert on auth.users
  for each row execute function public.capture_ojt_professor_registration();

-- Recover professor signups made before this migration was installed.
insert into public.ojt_professor_requests (user_id, full_name, email, institution, department)
select id, trim(raw_user_meta_data->>'full_name'), coalesce(email, ''),
  trim(raw_user_meta_data->>'institution'), trim(coalesce(raw_user_meta_data->>'department', ''))
from auth.users where raw_user_meta_data->>'account_type' = 'professor'
  and length(trim(raw_user_meta_data->>'full_name')) between 1 and 160
  and length(trim(raw_user_meta_data->>'institution')) between 1 and 160
  and length(trim(coalesce(raw_user_meta_data->>'department', ''))) <= 160
on conflict (user_id) do nothing;

-- Preserve student hour targets even when signup requires email confirmation.
create or replace function public.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare hours integer := 200; raw_hours text := new.raw_user_meta_data->>'required_hours';
begin
  if length(raw_hours) <= 5 and raw_hours ~ '^[0-9]+$' then
    if raw_hours::integer between 1 and 10000 then hours := raw_hours::integer; end if;
  end if;
  insert into public.profiles (id, full_name, email, required_hours)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), coalesce(new.email, ''), hours)
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.ojt_account_context()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare request public.ojt_professor_requests; approved boolean;
begin
  if auth.uid() is null then raise exception 'Sign in to confirm your account access.'; end if;
  select * into request from public.ojt_professor_requests where user_id = auth.uid();
  select exists(select 1 from public.ojt_coordinators where user_id = auth.uid()) into approved;
  return jsonb_build_object('account_type', case when approved or request.user_id is not null then 'professor' else 'student' end,
    'status', case when approved or request.user_id is null then 'active' else 'pending' end,
    'institution', coalesce(request.institution, ''), 'department', coalesce(request.department, ''));
end;
$$;
revoke all on function public.capture_ojt_professor_registration() from public, anon, authenticated;
revoke all on function public.create_profile_for_new_user() from public, anon, authenticated;
revoke all on function public.ojt_account_context() from public, anon;
grant execute on function public.ojt_account_context() to authenticated;
-- Make the new RPC visible immediately after the transaction commits.
notify pgrst, 'reload schema';
commit;
