-- Run after the existing Supabase migrations.
-- Shortens professor coordinator codes to six characters without changing enrollments.
begin;

alter table public.ojt_coordinators
  drop constraint if exists ojt_coordinators_join_code_check;

alter table public.ojt_coordinators
  add constraint ojt_coordinators_join_code_check
  check (join_code ~ '^[A-Z0-9]{6,32}$');

alter table public.ojt_coordinators
  alter column join_code set default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

-- Assign every current professor a short code. The retry loop handles the unlikely
-- event that two generated codes are identical. Existing student enrollments use
-- the professor's user ID, so they remain connected after this update.
do $$
declare
  coordinator record;
  candidate text;
begin
  for coordinator in select user_id from public.ojt_coordinators loop
    loop
      candidate := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
      begin
        update public.ojt_coordinators
        set join_code = candidate
        where user_id = coordinator.user_id;
        exit;
      exception when unique_violation then
        -- Generate another candidate and retry this professor.
        null;
      end;
    end loop;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
commit;
