-- Apply after supabase-admin-document-requirements-migration.sql.
-- Adds reversible administrator management for student achievement badges.
begin;

create table if not exists public.ojt_badge_definitions (
  badge_id text primary key check (badge_id ~ '^[a-z0-9][a-z0-9-]{2,63}$'),
  badge_name text not null check (length(trim(badge_name)) between 3 and 80),
  icon text not null check (char_length(trim(icon)) between 1 and 16),
  description text not null check (length(trim(description)) between 3 and 240),
  metric_type text not null check (metric_type in (
    'attendance_days', 'full_days', 'accomplishment_days', 'best_streak',
    'current_streak', 'total_hours', 'hours_percent')),
  goal_value numeric(10,2) not null check (goal_value > 0 and goal_value <= 10000),
  xp_reward integer not null check (xp_reward between 0 and 10000),
  display_order integer not null check (display_order between 1 and 10000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.ojt_badge_definitions
  (badge_id, badge_name, icon, description, metric_type, goal_value, xp_reward, display_order)
values
  ('first', 'First Day', '🌱', 'Log your first OJT day.', 'attendance_days', 1, 25, 1),
  ('full', 'Full Day', '⭐', 'Complete an 8-hour day. Overtime adds no extra XP.', 'full_days', 1, 25, 2),
  ('reflection', 'First Reflection', '📝', 'Add an accomplishment in your shift notes.', 'accomplishment_days', 1, 25, 3),
  ('streak3', 'Finding Rhythm', '🔥', 'Build a 3-day attendance streak.', 'best_streak', 3, 50, 4),
  ('streak5', '5-Day Streak', '🔥', 'Build a 5-day attendance streak.', 'best_streak', 5, 100, 5),
  ('streak10', 'Consistent Contributor', '💪', 'Build a 10-day attendance streak.', 'best_streak', 10, 150, 6),
  ('streak20', 'Consistency Champion', '🏅', 'Build a 20-day attendance streak.', 'best_streak', 20, 250, 7),
  ('journal', 'Growth Journal', '📚', 'Record accomplishments on 10 different days.', 'accomplishment_days', 10, 100, 8),
  ('quarter', 'Getting There', '🚀', 'Complete 25% of your required OJT hours.', 'hours_percent', 25, 75, 9),
  ('half', 'Halfway Hero', '🎯', 'Complete 50% of your required OJT hours.', 'hours_percent', 50, 150, 10),
  ('finish', 'OJT Finisher', '🏆', 'Complete all your required OJT hours.', 'hours_percent', 100, 300, 11)
on conflict (badge_id) do nothing;

alter table public.ojt_badge_definitions enable row level security;
revoke all on public.ojt_badge_definitions from public, anon, authenticated;
grant select on public.ojt_badge_definitions to authenticated;
drop policy if exists "Authenticated read active badge definitions" on public.ojt_badge_definitions;
create policy "Authenticated read active badge definitions" on public.ojt_badge_definitions
  for select to authenticated using (is_active);

alter table public.ojt_admin_events add column if not exists detail text;

create or replace function public.ojt_badges(p_include_inactive boolean default false)
returns table(badge_id text, badge_name text, icon text, description text,
  metric_type text, goal_value numeric, xp_reward integer, display_order integer, is_active boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in to load badge settings.'; end if;
  if p_include_inactive and not exists(select 1 from public.ojt_admins where user_id = auth.uid())
    then raise exception 'Administrator access required' using errcode = '42501'; end if;
  return query select b.badge_id, b.badge_name, b.icon, b.description, b.metric_type,
    b.goal_value::numeric, b.xp_reward, b.display_order, b.is_active
  from public.ojt_badge_definitions b
  where b.is_active or p_include_inactive
  order by b.display_order, b.badge_name;
end;
$$;

create or replace function public.ojt_admin_save_badge(p_id text, p_name text, p_icon text,
  p_description text, p_metric text, p_goal numeric, p_xp integer, p_order integer)
returns void language plpgsql security definer set search_path = '' as $$
declare clean_name text := trim(coalesce(p_name, '')); clean_icon text := trim(coalesce(p_icon, ''));
  clean_description text := trim(coalesce(p_description, '')); action_name text;
begin
  if not exists(select 1 from public.ojt_admins where user_id = auth.uid()) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_id is null or p_id !~ '^[a-z0-9][a-z0-9-]{2,63}$' then raise exception 'Invalid badge identifier.'; end if;
  if length(clean_name) not between 3 and 80 then raise exception 'Use a badge name between 3 and 80 characters.'; end if;
  if char_length(clean_icon) not between 1 and 16 then raise exception 'Use an icon between 1 and 16 characters.'; end if;
  if length(clean_description) not between 3 and 240 then raise exception 'Use a description between 3 and 240 characters.'; end if;
  if p_metric is null or p_metric not in ('attendance_days', 'full_days', 'accomplishment_days',
    'best_streak', 'current_streak', 'total_hours', 'hours_percent') then raise exception 'Choose a supported badge measurement.'; end if;
  if p_goal is null or p_goal <= 0 or p_goal > 10000 then raise exception 'Use a target greater than 0 and no more than 10,000.'; end if;
  if p_xp is null or p_xp not between 0 and 10000 then raise exception 'Use an XP reward from 0 to 10,000.'; end if;
  if p_order is null or p_order not between 1 and 10000 then raise exception 'Use a display order from 1 to 10,000.'; end if;

  if exists(select 1 from public.ojt_badge_definitions where badge_id = p_id) then
    update public.ojt_badge_definitions set badge_name = clean_name, icon = clean_icon,
      description = clean_description, metric_type = p_metric, goal_value = p_goal,
      xp_reward = p_xp, display_order = p_order, updated_at = now() where badge_id = p_id;
    action_name := 'Updated badge';
  else
    insert into public.ojt_badge_definitions
      (badge_id, badge_name, icon, description, metric_type, goal_value, xp_reward, display_order)
    values (p_id, clean_name, clean_icon, clean_description, p_metric, p_goal, p_xp, p_order);
    action_name := 'Added badge';
  end if;
  insert into public.ojt_admin_events(actor, subject, action, detail)
    values(auth.uid(), auth.uid(), action_name, clean_name);
end;
$$;

create or replace function public.ojt_admin_set_badge_active(p_id text, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare badge_name text;
begin
  if not exists(select 1 from public.ojt_admins where user_id = auth.uid()) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_active is null then raise exception 'Choose whether the badge is active.'; end if;
  perform 1 from public.ojt_badge_definitions for update;
  select b.badge_name into badge_name from public.ojt_badge_definitions b where b.badge_id = p_id;
  if badge_name is null then raise exception 'Badge not found. Refresh and try again.'; end if;
  if not p_active and (select count(*) from public.ojt_badge_definitions where is_active) <= 1
    and (select is_active from public.ojt_badge_definitions where badge_id = p_id)
    then raise exception 'At least one badge must remain active.'; end if;
  update public.ojt_badge_definitions set is_active = p_active, updated_at = now() where badge_id = p_id;
  insert into public.ojt_admin_events(actor, subject, action, detail)
    values(auth.uid(), auth.uid(), case when p_active then 'Restored badge' else 'Removed badge' end, badge_name);
end;
$$;

revoke all on function public.ojt_badges(boolean),
  public.ojt_admin_save_badge(text, text, text, text, text, numeric, integer, integer),
  public.ojt_admin_set_badge_active(text, boolean) from public, anon;
grant execute on function public.ojt_badges(boolean),
  public.ojt_admin_save_badge(text, text, text, text, text, numeric, integer, integer),
  public.ojt_admin_set_badge_active(text, boolean) to authenticated;

notify pgrst, 'reload schema';
commit;
