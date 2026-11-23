-- Apply after supabase-student-roster-management-migration.sql.
begin;
create table if not exists public.ojt_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table if not exists public.ojt_admin_events (
  id bigint generated always as identity primary key,
  actor uuid not null, subject uuid not null, action text not null,
  happened_at timestamptz not null default now()
);
alter table public.ojt_admins enable row level security;
alter table public.ojt_admin_events enable row level security;
revoke all on public.ojt_admins, public.ojt_admin_events from public, anon, authenticated;

-- Preserve the installed professor/student access rules.
do $$ begin
  if to_regprocedure('public.ojt_member_context()') is null then
    alter function public.ojt_account_context() rename to ojt_member_context;
  end if;
end $$;
revoke all on function public.ojt_member_context() from public, anon, authenticated;
create or replace function public.ojt_account_context() returns jsonb
language sql stable security definer set search_path='' as $$
  select case when exists(select from public.ojt_admins where user_id=auth.uid())
    then jsonb_build_object('account_type','admin','status','active')
    else public.ojt_member_context() end
$$;

create or replace function public.ojt_admin_overview() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not exists(select from public.ojt_admins where user_id=auth.uid()) then
    raise exception 'Administrator access required' using errcode='42501';
  end if;
  return jsonb_build_object('accounts', coalesce((select jsonb_agg(to_jsonb(r) order by r.name,r.email,r.id) from (
    select u.id,u.email,coalesce(nullif(p.full_name,''),u.email) as name,
      case when a.user_id is not null then 'Administrator' when c.user_id is not null then 'Professor' else 'Student' end as role,
      owner.display_name as coordinator,e.coordinator_id,p.required_hours,
      coalesce(h.hours,0) as hours
    from auth.users u left join public.profiles p on p.id=u.id
    left join public.ojt_admins a on a.user_id=u.id
    left join public.ojt_coordinators c on c.user_id=u.id
    left join public.ojt_enrollments e on e.student_id=u.id and e.archived_at is null
    left join public.ojt_coordinators owner on owner.user_id=e.coordinator_id
    left join (select user_id,sum(total_hours) as hours from public.shifts group by user_id) h on h.user_id=u.id
  ) r),'[]'::jsonb),'awaiting',(select count(*) from public.ojt_documents where status='submitted'),
  'events',coalesce((select jsonb_agg(to_jsonb(t) order by t.id desc) from (
    select l.id,l.happened_at,l.action,coalesce(u.email,l.actor::text) as actor,coalesce(s.email,l.subject::text) as subject
    from public.ojt_admin_events l left join auth.users u on u.id=l.actor left join auth.users s on s.id=l.subject
    order by l.id desc limit 50
  ) t),'[]'::jsonb));
end $$;

create or replace function public.ojt_admin_manage(p_action text,p_user uuid,p_coordinator uuid default null)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists(select from public.ojt_admins where user_id=auth.uid()) then
    raise exception 'Administrator access required' using errcode='42501';
  end if;
  if p_action='Reset coordinator code' then
    update public.ojt_coordinators set join_code=default where user_id=p_user;
  elsif p_action='Disconnect enrollment' then
    update public.ojt_enrollments set archived_at=now() where student_id=p_user and coordinator_id=p_coordinator and archived_at is null;
  else raise exception 'Unknown administrative action';
  end if;
  if not found then raise exception 'Account or enrollment changed. Refresh and try again.'; end if;
  insert into public.ojt_admin_events(actor,subject,action) values(auth.uid(),p_user,p_action);
end $$;
revoke all on function public.ojt_account_context(), public.ojt_admin_overview(), public.ojt_admin_manage(text,uuid,uuid) from public,anon;
grant execute on function public.ojt_account_context(), public.ojt_admin_overview(), public.ojt_admin_manage(text,uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
