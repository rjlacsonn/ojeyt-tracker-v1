-- Apply after supabase-admin-migration.sql.
-- Archived enrollments disappear from the professor's roster, review inbox,
-- progress cards, and private document downloads. Student records stay preserved.
begin;

drop policy if exists "Participants read documents" on public.ojt_documents;
create policy "Participants read documents" on public.ojt_documents
  for select to authenticated using (
    user_id = (select auth.uid()) or (
      coordinator_id = (select auth.uid()) and status <> 'draft' and exists (
        select 1 from public.ojt_enrollments e
        where e.student_id = ojt_documents.user_id
          and e.coordinator_id = (select auth.uid())
          and e.archived_at is null
      )
    )
  );

drop policy if exists "Participants download OJT files" on storage.objects;
create policy "Participants download OJT files" on storage.objects
  for select to authenticated using (
    bucket_id = 'ojt-documents' and (
      (storage.foldername(name))[1] = (select auth.uid())::text or exists (
        select 1 from public.ojt_documents d
        join public.ojt_enrollments e
          on e.student_id = d.user_id and e.coordinator_id = d.coordinator_id
        where d.file_path = name
          and d.coordinator_id = (select auth.uid())
          and d.status <> 'draft'
          and e.archived_at is null
      )
    )
  );

notify pgrst, 'reload schema';
commit;
