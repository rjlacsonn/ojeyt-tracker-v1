-- Apply after supabase-archived-review-cleanup-migration.sql.
-- Adds reversible administrator management for the student document checklist.
begin;

create table if not exists public.ojt_document_requirements (
  requirement_id text primary key check (requirement_id ~ '^[a-z0-9][a-z0-9-]{2,63}$'),
  requirement_name text not null check (length(trim(requirement_name)) between 3 and 120),
  requirement_number integer not null check (requirement_number between 1 and 9999),
  display_order integer not null check (display_order between 1 and 10000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.ojt_document_requirements
  (requirement_id, requirement_name, requirement_number, display_order)
values
  ('application', 'OJT Application Form', 4, 1),
  ('deployment-interview', 'Pre-OJT Deployment Interview', 5, 2),
  ('information-monitoring', 'OJT Information and Monitoring Form', 6, 3),
  ('feedback-paper', 'OJT Feedback Paper Pattern', 7, 4),
  ('professional-development', 'OJT Professional Development Activities', 8, 5),
  ('work-pictures', 'OJT Pictures at Work', 9, 6),
  ('waiver', 'OJT Waiver', 10, 7),
  ('certification', 'OJT Certification', 11, 8),
  ('undertaking-consent', 'OJT Deed of Undertaking / Informed Consent', 12, 9),
  ('confidentiality', 'Non-Disclosure and Confidentiality Agreement', 13, 10)
on conflict (requirement_id) do nothing;

alter table public.ojt_document_requirements enable row level security;
revoke all on public.ojt_document_requirements from public, anon, authenticated;
grant select on public.ojt_document_requirements to authenticated;
drop policy if exists "Authenticated read active document requirements" on public.ojt_document_requirements;
create policy "Authenticated read active document requirements" on public.ojt_document_requirements
  for select to authenticated using (is_active);

-- The original table restricted IDs to the ten initial values. The managed
-- requirement table and registration function now provide that validation.
alter table public.ojt_documents
  drop constraint if exists ojt_documents_requirement_id_check;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ojt_documents_requirement_id_fkey'
      and conrelid = 'public.ojt_documents'::regclass
  ) then
    alter table public.ojt_documents
      add constraint ojt_documents_requirement_id_fkey
      foreign key (requirement_id)
      references public.ojt_document_requirements(requirement_id);
  end if;
end $$;

alter table public.ojt_admin_events add column if not exists detail text;

create or replace function public.ojt_document_requirements(p_include_inactive boolean default false)
returns table(requirement_id text, requirement_name text, requirement_number integer,
  display_order integer, is_active boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in to load document requirements.'; end if;
  if p_include_inactive and not exists (
    select 1 from public.ojt_admins where user_id = auth.uid()
  ) then raise exception 'Administrator access required' using errcode = '42501'; end if;
  return query
    select r.requirement_id, r.requirement_name, r.requirement_number, r.display_order, r.is_active
    from public.ojt_document_requirements r
    where r.is_active or p_include_inactive
    order by r.display_order, r.requirement_number, r.requirement_name;
end;
$$;

create or replace function public.ojt_admin_save_requirement(
  p_id text, p_name text, p_number integer, p_order integer)
returns void language plpgsql security definer set search_path = '' as $$
declare clean_name text := trim(coalesce(p_name, '')); action_name text;
begin
  if not exists(select 1 from public.ojt_admins where user_id = auth.uid()) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_id is null or p_id !~ '^[a-z0-9][a-z0-9-]{2,63}$' then raise exception 'Invalid requirement identifier.'; end if;
  if length(clean_name) not between 3 and 120 then raise exception 'Use a section name between 3 and 120 characters.'; end if;
  if p_number is null or p_number not between 1 and 9999 then raise exception 'Use a section number from 1 to 9999.'; end if;
  if p_order is null or p_order not between 1 and 10000 then raise exception 'Use a display order from 1 to 10000.'; end if;

  if exists(select 1 from public.ojt_document_requirements where requirement_id = p_id) then
    update public.ojt_document_requirements set requirement_name = clean_name,
      requirement_number = p_number, display_order = p_order, updated_at = now()
    where requirement_id = p_id;
    action_name := 'Updated document requirement';
  else
    insert into public.ojt_document_requirements
      (requirement_id, requirement_name, requirement_number, display_order)
    values (p_id, clean_name, p_number, p_order);
    action_name := 'Added document requirement';
  end if;
  insert into public.ojt_admin_events(actor, subject, action, detail)
    values(auth.uid(), auth.uid(), action_name, clean_name);
end;
$$;

create or replace function public.ojt_admin_set_requirement_active(p_id text, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare requirement_name text;
begin
  if not exists(select 1 from public.ojt_admins where user_id = auth.uid()) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_active is null then raise exception 'Choose whether the requirement is active.'; end if;
  perform 1 from public.ojt_document_requirements for update;
  select r.requirement_name into requirement_name
    from public.ojt_document_requirements r where r.requirement_id = p_id;
  if requirement_name is null then raise exception 'Requirement not found. Refresh and try again.'; end if;
  if not p_active and (select count(*) from public.ojt_document_requirements where is_active) <= 1
    and (select is_active from public.ojt_document_requirements where requirement_id = p_id)
    then raise exception 'At least one document requirement must remain active.'; end if;
  update public.ojt_document_requirements set is_active = p_active, updated_at = now()
    where requirement_id = p_id;
  insert into public.ojt_admin_events(actor, subject, action, detail)
    values(auth.uid(), auth.uid(), case when p_active then 'Restored document requirement' else 'Removed document requirement' end, requirement_name);
end;
$$;

create or replace function public.ojt_admin_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.ojt_admins where user_id = auth.uid()) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  return jsonb_build_object('accounts', coalesce((select jsonb_agg(to_jsonb(r) order by r.name,r.email,r.id) from (
    select u.id,u.email,coalesce(nullif(p.full_name,''),u.email) as name,
      case when a.user_id is not null then 'Administrator' when c.user_id is not null then 'Professor' else 'Student' end as role,
      owner.display_name as coordinator,e.coordinator_id,p.required_hours,coalesce(h.hours,0) as hours
    from auth.users u left join public.profiles p on p.id=u.id
    left join public.ojt_admins a on a.user_id=u.id
    left join public.ojt_coordinators c on c.user_id=u.id
    left join public.ojt_enrollments e on e.student_id=u.id and e.archived_at is null
    left join public.ojt_coordinators owner on owner.user_id=e.coordinator_id
    left join (select user_id,sum(total_hours) as hours from public.shifts group by user_id) h on h.user_id=u.id
  ) r),'[]'::jsonb),
  'awaiting',(select count(*) from public.ojt_documents d join public.ojt_document_requirements r
    on r.requirement_id=d.requirement_id and r.is_active where d.status='submitted'),
  'events',coalesce((select jsonb_agg(to_jsonb(t) order by t.id desc) from (
    select l.id,l.happened_at,l.action,coalesce(u.email,l.actor::text) as actor,
      coalesce(l.detail,s.email,l.subject::text) as subject
    from public.ojt_admin_events l left join auth.users u on u.id=l.actor
    left join auth.users s on s.id=l.subject order by l.id desc limit 50
  ) t),'[]'::jsonb));
end;
$$;

create or replace function public.ojt_register_document(p_requirement text, p_path text, p_name text)
returns public.ojt_documents language plpgsql security definer set search_path = '' as $$
declare stored storage.objects; result public.ojt_documents;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if not exists(select 1 from public.ojt_document_requirements where requirement_id = p_requirement and is_active)
    then raise exception 'This document requirement is no longer active. Refresh the page.'; end if;
  if split_part(p_path, '/', 1) <> auth.uid()::text or split_part(p_path, '/', 2) <> p_requirement
    or array_length(string_to_array(p_path, '/'), 1) <> 3
    or split_part(p_path, '/', 3) !~ '^[a-f0-9-]{36}\.(pdf|doc|docx|xls|xlsx|jpg|jpeg|png)$'
    then raise exception 'Invalid file path.'; end if;
  select * into stored from storage.objects where bucket_id = 'ojt-documents' and name = p_path;
  if stored.id is null then raise exception 'Upload the file before saving it.'; end if;
  insert into public.ojt_documents (user_id, requirement_id, file_path, file_name, file_size, content_type)
    values (auth.uid(), p_requirement, p_path, p_name,
      (stored.metadata->>'size')::bigint, stored.metadata->>'mimetype') returning * into result;
  return result;
end;
$$;

create or replace function public.ojt_submit_documents(p_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare recipient uuid; locked_ids uuid[]; affected integer;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if coalesce(cardinality(p_ids), 0) = 0 then raise exception 'Choose files to submit.'; end if;
  select coordinator_id into recipient from public.ojt_enrollments
    where student_id = auth.uid() and archived_at is null for share;
  if recipient is null then raise exception 'Connect to your coordinator before submitting.'; end if;
  select array_agg(id) into locked_ids from (
    select d.id from public.ojt_documents d
    join public.ojt_document_requirements r on r.requirement_id = d.requirement_id and r.is_active
    where d.user_id = auth.uid() and d.id = any(p_ids) and d.status in ('draft', 'returned')
    for update of d
  ) locked;
  if coalesce(cardinality(locked_ids), 0) <> cardinality(p_ids) then
    raise exception 'Some files changed, were already submitted, or belong to a removed requirement. Refresh and try again.';
  end if;
  update public.ojt_documents d set status = 'submitted', coordinator_id = recipient,
    student_name = coalesce((select full_name from public.profiles where id = auth.uid()), ''),
    student_email = coalesce((select email from auth.users where id = auth.uid()), ''),
    submitted_at = now(), reviewed_at = null, feedback = '' where d.id = any(locked_ids);
  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.ojt_completed_requirement_count(p_student_id uuid, p_coordinator_id uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from (
    select d.requirement_id
    from public.ojt_documents d
    join public.ojt_document_requirements r on r.requirement_id = d.requirement_id and r.is_active
    where d.user_id = p_student_id and d.coordinator_id = p_coordinator_id
    group by d.requirement_id having bool_and(d.status = 'approved')
  ) completed;
$$;

create or replace function public.ojt_student_is_complete(p_student_id uuid, p_coordinator_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.ojt_completed_requirement_count(p_student_id, p_coordinator_id) =
      (select count(*) from public.ojt_document_requirements where is_active)
    and coalesce(p.required_hours, 0) > 0
    and coalesce((select sum(s.total_hours) from public.shifts s where s.user_id = p_student_id), 0) >= p.required_hours
  from public.profiles p where p.id = p_student_id;
$$;

create or replace function public.ojt_archive_completed_student(p_student_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.ojt_is_coordinator() then raise exception 'Professor access required.'; end if;
  if not exists(select 1 from public.ojt_enrollments e where e.student_id = p_student_id
    and e.coordinator_id = auth.uid() and e.archived_at is null)
    then raise exception 'This student is not in your active roster.'; end if;
  if not coalesce(public.ojt_student_is_complete(p_student_id, auth.uid()), false) then
    raise exception 'The student must complete all active document requirements and all assigned OJT hours before removal.';
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
  perform 1 from public.ojt_enrollments where coordinator_id = auth.uid() and archived_at is null for update;
  select count(*)::integer into active_count from public.ojt_enrollments where coordinator_id = auth.uid() and archived_at is null;
  if active_count = 0 then raise exception 'There are no active students to clear.'; end if;
  if exists(select 1 from public.ojt_enrollments e where e.coordinator_id = auth.uid() and e.archived_at is null
    and not coalesce(public.ojt_student_is_complete(e.student_id, e.coordinator_id), false))
    then raise exception 'Every active student must complete all active document requirements and assigned OJT hours before clearing the roster.'; end if;
  update public.ojt_enrollments set archived_at = now() where coordinator_id = auth.uid() and archived_at is null;
  return active_count;
end;
$$;

-- Professors only see and download files for active requirements and active students.
drop policy if exists "Participants read documents" on public.ojt_documents;
create policy "Participants read documents" on public.ojt_documents
  for select to authenticated using (
    user_id = (select auth.uid()) or (
      coordinator_id = (select auth.uid()) and status <> 'draft'
      and exists(select 1 from public.ojt_document_requirements r where r.requirement_id = ojt_documents.requirement_id and r.is_active)
      and exists(select 1 from public.ojt_enrollments e where e.student_id = ojt_documents.user_id
        and e.coordinator_id = (select auth.uid()) and e.archived_at is null)
    )
  );

drop policy if exists "Participants download OJT files" on storage.objects;
create policy "Participants download OJT files" on storage.objects
  for select to authenticated using (
    bucket_id = 'ojt-documents' and (
      (storage.foldername(name))[1] = (select auth.uid())::text or exists (
        select 1 from public.ojt_documents d
        join public.ojt_document_requirements r on r.requirement_id = d.requirement_id and r.is_active
        join public.ojt_enrollments e on e.student_id = d.user_id and e.coordinator_id = d.coordinator_id
        where d.file_path = name and d.coordinator_id = (select auth.uid())
          and d.status <> 'draft' and e.archived_at is null
      )
    )
  );

revoke all on function public.ojt_document_requirements(boolean),
  public.ojt_admin_save_requirement(text, text, integer, integer),
  public.ojt_admin_set_requirement_active(text, boolean) from public, anon;
grant execute on function public.ojt_document_requirements(boolean),
  public.ojt_admin_save_requirement(text, text, integer, integer),
  public.ojt_admin_set_requirement_active(text, boolean) to authenticated;

notify pgrst, 'reload schema';
commit;
