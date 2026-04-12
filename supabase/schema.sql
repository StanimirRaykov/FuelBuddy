create extension if not exists pgcrypto;

-- Profiles: one row per user, auto-created on sign-up via trigger.
-- Store display names or preferences here; auth data lives in auth.users.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.profiles enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
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

-- Auto-create a profile row whenever a new user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


create table if not exists public.cars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  make text,
  model text,
  tank_capacity_liters numeric(8, 2),
  fuel_type            text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.refills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  car_id uuid not null references public.cars (id) on delete cascade,
  odometer_km numeric(10, 1) not null check (odometer_km >= 0),
  fuel_price numeric(10, 3) not null check (fuel_price >= 0),
  fuel_amount_liters numeric(10, 2) not null check (fuel_amount_liters > 0),
  fill_to_top boolean not null default true,
  filled_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists cars_user_id_idx on public.cars (user_id);
create index if not exists refills_user_id_idx on public.refills (user_id);
create index if not exists refills_car_id_idx on public.refills (car_id);
create index if not exists refills_car_id_filled_at_idx on public.refills (car_id, filled_at desc);

alter table public.cars enable row level security;
alter table public.refills enable row level security;

drop policy if exists "Users can view own cars" on public.cars;
create policy "Users can view own cars"
on public.cars
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own cars" on public.cars;
create policy "Users can insert own cars"
on public.cars
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own cars" on public.cars;
create policy "Users can update own cars"
on public.cars
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own cars" on public.cars;
create policy "Users can delete own cars"
on public.cars
for delete
using (auth.uid() = user_id);

drop policy if exists "Users can view own refills" on public.refills;
create policy "Users can view own refills"
on public.refills
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own refills" on public.refills;
create policy "Users can insert own refills"
on public.refills
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own refills" on public.refills;
create policy "Users can update own refills"
on public.refills
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own refills" on public.refills;
create policy "Users can delete own refills"
on public.refills
for delete
using (auth.uid() = user_id);
