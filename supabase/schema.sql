-- ===========================================================================
-- Check in with Sorra — Supabase schema
-- ===========================================================================
-- Run this once in the Supabase SQL Editor (Dashboard → SQL → New query).
-- It creates the profiles + sessions tables, locks them down with Row Level
-- Security so each user can only touch their own rows, and auto-creates a
-- profile row (copying the name from signup) whenever a user signs up.
--
-- Auth itself (email + hashed password) is handled by Supabase Auth in the
-- built-in auth.users table — we never store raw passwords ourselves.
-- ===========================================================================

-- --- profiles: one row per user ---------------------------------------------
create table if not exists public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  name               text,
  feedback_submitted boolean not null default false,  -- 5-session Google Form gate
  created_at         timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update using (auth.uid() = id);

-- --- sessions: one row per login, holds that conversation --------------------
create table if not exists public.sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  transcript jsonb not null default '[]'::jsonb,   -- [{role, content}, ...]
  summary    text,                                  -- short gentle recap for cross-session recall
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sessions_user_id_idx on public.sessions (user_id);

alter table public.sessions enable row level security;

drop policy if exists "sessions_select_own" on public.sessions;
create policy "sessions_select_own"
  on public.sessions for select using (auth.uid() = user_id);

drop policy if exists "sessions_insert_own" on public.sessions;
create policy "sessions_insert_own"
  on public.sessions for insert with check (auth.uid() = user_id);

drop policy if exists "sessions_update_own" on public.sessions;
create policy "sessions_update_own"
  on public.sessions for update using (auth.uid() = user_id);

-- --- auto-create a profile on signup ----------------------------------------
-- Copies the `name` passed in signUp({ options: { data: { name } } }).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, new.raw_user_meta_data ->> 'name');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
