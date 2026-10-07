-- Run after supabase-schema.sql in Supabase SQL Editor.
-- Follow with the account-registration and student-approval migrations (see DOCUMENTS_SETUP.md).
begin;

create table if not exists public.ojt_coordinators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 160),
  join_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
    check (join_code ~ '^[A-Z0-9]{8,32}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.ojt_enrollments (
  student_id uuid primary key references auth.users(id) on delete cascade,
  coordinator_id uuid not null references public.ojt_coordinators(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  check (student_id <> coordinator_id)
);

create table if not exists public.ojt_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  requirement_id text not null check (requirement_id in (
    'application', 'deployment-interview', 'information-monitoring', 'feedback-paper',
    'professional-development', 'work-pictures', 'waiver', 'certification',
    'undertaking-consent', 'confidentiality')),
  file_path text not null unique,
  file_name text not null check (length(file_name) between 1 and 240),
  file_size bigint not null check (file_size between 1 and 10485760),
  content_type text not null,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'returned')),
  coordinator_id uuid references public.ojt_coordinators(user_id) on delete set null,
  student_name text not null default '',
  student_email text not null default '',
  feedback text not null default '' check (length(feedback) <= 4000),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (file_path like user_id::text || '/' || requirement_id || '/%')
);
create index if not exists ojt_documents_student_idx on public.ojt_documents(user_id, created_at desc);
create index if not exists ojt_documents_review_idx on public.ojt_documents(coordinator_id, status, submitted_at desc);
create index if not exists ojt_enrollments_coordinator_idx on public.ojt_enrollments(coordinator_id);

alter table public.ojt_coordinators enable row level security;
alter table public.ojt_enrollments enable row level security;
alter table public.ojt_documents enable row level security;

-- No browser can assign coordinator roles or change review fields directly.
revoke all on public.ojt_coordinators, public.ojt_enrollments, public.ojt_documents from anon, authenticated;
grant select on public.ojt_coordinators, public.ojt_enrollments, public.ojt_documents to authenticated;
grant delete on public.ojt_documents to authenticated;

drop policy if exists "Coordinator reads own registration" on public.ojt_coordinators;
create policy "Coordinator reads own registration" on public.ojt_coordinators
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Participants read own enrollment" on public.ojt_enrollments;
create policy "Participants read own enrollment" on public.ojt_enrollments
  for select to authenticated using (student_id = (select auth.uid()) or coordinator_id = (select auth.uid()));
drop policy if exists "Participants read documents" on public.ojt_documents;
create policy "Participants read documents" on public.ojt_documents
  for select to authenticated using (user_id = (select auth.uid()) or
    (coordinator_id = (select auth.uid()) and status <> 'draft'));
drop policy if exists "Student removes editable documents" on public.ojt_documents;
create policy "Student removes editable documents" on public.ojt_documents
  for delete to authenticated using (user_id = (select auth.uid()) and status in ('draft', 'returned'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ojt-documents', 'ojt-documents', false, 10485760, array[
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Student uploads own OJT files" on storage.objects;
create policy "Student uploads own OJT files" on storage.objects for insert to authenticated
  with check (bucket_id = 'ojt-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Participants download OJT files" on storage.objects;
create policy "Participants download OJT files" on storage.objects for select to authenticated
  using (bucket_id = 'ojt-documents' and ((storage.foldername(name))[1] = (select auth.uid())::text or
    exists (select 1 from public.ojt_documents d where d.file_path = name
      and d.coordinator_id = (select auth.uid()) and d.status <> 'draft')));
-- Submitted files cannot be overwritten or deleted. Delete the editable draft record first.
drop policy if exists "Student cleans unreferenced OJT files" on storage.objects;
create policy "Student cleans unreferenced OJT files" on storage.objects for delete to authenticated
  using (bucket_id = 'ojt-documents' and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (select 1 from public.ojt_documents d where d.file_path = name));

create or replace function public.ojt_document_context()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare coordinator public.ojt_coordinators; recipient public.ojt_coordinators;
begin
  if auth.uid() is null then raise exception 'Sign in to access documents.'; end if;
  select * into coordinator from public.ojt_coordinators where user_id = auth.uid();
  select c.* into recipient from public.ojt_enrollments e join public.ojt_coordinators c
    on c.user_id = e.coordinator_id where e.student_id = auth.uid();
  return jsonb_build_object('is_coordinator', coordinator.user_id is not null,
    'join_code', coordinator.join_code, 'coordinator_name', coordinator.display_name,
    'recipient_id', recipient.user_id, 'recipient_name', recipient.display_name);
end;
$$;

create or replace function public.ojt_join_coordinator(p_code text)
returns void language plpgsql security definer set search_path = '' as $$
declare recipient uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select user_id into recipient from public.ojt_coordinators where join_code = upper(trim(p_code));
  if recipient is null or recipient = auth.uid() then raise exception 'Coordinator code not found.'; end if;
  -- Previous submissions keep their original reviewer even when the student changes coordinator.
  insert into public.ojt_enrollments (student_id, coordinator_id) values (auth.uid(), recipient)
    on conflict (student_id) do update set coordinator_id = excluded.coordinator_id;
end;
$$;

create or replace function public.ojt_register_document(p_requirement text, p_path text, p_name text)
returns public.ojt_documents language plpgsql security definer set search_path = '' as $$
declare stored storage.objects; result public.ojt_documents;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
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
  select coordinator_id into recipient from public.ojt_enrollments where student_id = auth.uid() for share;
  if recipient is null then raise exception 'Connect to your coordinator before submitting.'; end if;
  select array_agg(id) into locked_ids from (select id from public.ojt_documents
    where user_id = auth.uid() and id = any(p_ids) and status in ('draft', 'returned')
    for update) d;
  if coalesce(cardinality(locked_ids), 0) <> cardinality(p_ids) then
    raise exception 'Some files changed or were already submitted. Refresh and try again.';
  end if;
  update public.ojt_documents d set status = 'submitted', coordinator_id = recipient,
    student_name = coalesce((select full_name from public.profiles where id = auth.uid()), ''),
    student_email = coalesce((select email from auth.users where id = auth.uid()), ''),
    submitted_at = now(), reviewed_at = null, feedback = '' where d.id = any(locked_ids);
  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.ojt_review_document(p_id uuid, p_decision text, p_feedback text default '')
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (select 1 from public.ojt_coordinators where user_id = auth.uid())
    then raise exception 'Coordinator access required.'; end if;
  if p_decision is null or p_decision not in ('approved', 'returned') then raise exception 'Invalid review decision.'; end if;
  if p_decision = 'returned' and length(trim(coalesce(p_feedback, ''))) = 0
    then raise exception 'Explain what the student needs to revise.'; end if;
  update public.ojt_documents set status = p_decision, feedback = trim(coalesce(p_feedback, '')),
    reviewed_at = now() where id = p_id and coordinator_id = auth.uid() and status = 'submitted';
  if not found then raise exception 'This file is unavailable or has already been reviewed. Refresh the list.'; end if;
end;
$$;

revoke all on function public.ojt_document_context() from public, anon;
revoke all on function public.ojt_join_coordinator(text) from public, anon;
revoke all on function public.ojt_register_document(text, text, text) from public, anon;
revoke all on function public.ojt_submit_documents(uuid[]) from public, anon;
revoke all on function public.ojt_review_document(uuid, text, text) from public, anon;
grant execute on function public.ojt_document_context(), public.ojt_join_coordinator(text),
  public.ojt_register_document(text, text, text), public.ojt_submit_documents(uuid[]),
  public.ojt_review_document(uuid, text, text) to authenticated;

commit;
