-- Run once in Supabase SQL Editor for an existing project.
-- Achievements and XP are derived from shifts; no rewards table is needed.
alter table public.shifts add column if not exists notes text;
alter table public.profiles add column if not exists profile_picture_url text;
