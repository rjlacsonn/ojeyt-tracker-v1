create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  required_hours integer not null default 200,
  profile_picture_url text,
  office_latitude double precision not null default 14.5995,
  office_longitude double precision not null default 120.9842,
  office_radius integer not null default 100,
  auto_check_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ojt_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  start_time timestamptz not null default now(),
  end_time timestamptz,
  duration_seconds integer not null default 0,
  check_in_latitude double precision,
  check_in_longitude double precision,
  check_out_latitude double precision,
  check_out_longitude double precision,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  morning_in time,
  morning_out time,
  afternoon_in time,
  afternoon_out time,
  overtime_start time,
  overtime_end time,
  total_hours decimal(4,2) not null default 0.00,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ojt_sessions_user_start_idx
  on public.ojt_sessions (user_id, start_time desc);

create index if not exists shifts_user_date_idx
  on public.shifts (user_id, date desc);

alter table public.profiles enable row level security;
alter table public.ojt_sessions enable row level security;
alter table public.shifts enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Users can read own sessions" on public.ojt_sessions;
create policy "Users can read own sessions"
  on public.ojt_sessions for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own sessions" on public.ojt_sessions;
create policy "Users can insert own sessions"
  on public.ojt_sessions for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own sessions" on public.ojt_sessions;
create policy "Users can update own sessions"
  on public.ojt_sessions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can read own shifts" on public.shifts;
create policy "Users can read own shifts"
  on public.shifts for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own shifts" on public.shifts;
create policy "Users can insert own shifts"
  on public.shifts for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own shifts" on public.shifts;
create policy "Users can update own shifts"
  on public.shifts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own shifts" on public.shifts;
create policy "Users can delete own shifts"
  on public.shifts for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can read own sessions" on public.ojt_sessions;
create policy "Users can read own sessions"
  on public.ojt_sessions for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own sessions" on public.ojt_sessions;
create policy "Users can insert own sessions"
  on public.ojt_sessions for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own sessions" on public.ojt_sessions;
create policy "Users can update own sessions"
  on public.ojt_sessions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.email, '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_profile_after_signup on auth.users;
create trigger create_profile_after_signup
  after insert on auth.users
  for each row execute function public.create_profile_for_new_user();

-- Keep existing installations compatible with accomplishments and avatars.
alter table public.shifts add column if not exists notes text;
alter table public.profiles add column if not exists profile_picture_url text;
