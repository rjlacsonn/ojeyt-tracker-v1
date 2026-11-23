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

-- Resolve every role directly so reapplying another migration cannot break the
-- administrator branch or leave it dependent on a renamed helper function.
create or replace function public.ojt_account_context()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  registration public.ojt_professor_requests;
  enrollment public.ojt_enrollments;
  professor_name text;
begin
  if auth.uid() is null then raise exception 'Sign in to confirm your account access.'; end if;
  if exists(select 1 from public.ojt_admins where user_id=auth.uid()) then
    return jsonb_build_object('account_type','admin','status','active');
  end if;
  select * into registration from public.ojt_professor_requests where user_id=auth.uid();
  if public.ojt_is_coordinator() then
    return jsonb_build_object('account_type','professor','status','active',
      'institution',coalesce(registration.institution,''),'department',coalesce(registration.department,''));
  end if;
  select * into enrollment from public.ojt_enrollments
    where student_id=auth.uid() and archived_at is null;
  select display_name into professor_name from public.ojt_coordinators
    where user_id=enrollment.coordinator_id;
  return jsonb_build_object('account_type','student',
    'status',case when enrollment.approval_status='approved' then 'active' else 'pending' end,
    'recipient_id',enrollment.coordinator_id,'recipient_name',professor_name,
    'institution','','department','');
end $$;

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
