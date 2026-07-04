-- Where Did I Put It? — Phase 4 starter schema
-- Run in the Supabase SQL editor. Review before running; adjust as the
-- app evolves. RLS is the entire security model — test it deliberately.

-- ---------- Tables ----------

create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text unique not null default substr(md5(random()::text), 1, 8),
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  household_id uuid references households(id) on delete set null,
  display_name text,
  created_at timestamptz not null default now()
);

create table items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  room text not null,
  spot text,
  pos text,
  container text,
  note text,
  created_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);

create table custom_rooms (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  unique (household_id, name)
);

create table custom_spots (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  room text not null,
  name text not null,
  unique (household_id, room, name)
);

create index items_household_idx on items (household_id, updated_at desc);

-- ---------- Row Level Security ----------

alter table households enable row level security;
alter table profiles enable row level security;
alter table items enable row level security;
alter table custom_rooms enable row level security;
alter table custom_spots enable row level security;

-- Helper: the current user's household
create or replace function my_household_id()
returns uuid language sql stable security definer as $$
  select household_id from profiles where id = auth.uid();
$$;

-- Profiles: users manage only their own row
create policy "own profile read"  on profiles for select using (id = auth.uid());
create policy "own profile write" on profiles for update using (id = auth.uid());
create policy "own profile insert" on profiles for insert with check (id = auth.uid());

-- Households: members can read their own household
create policy "member read" on households for select
  using (id = my_household_id());
create policy "authenticated create" on households for insert
  with check (auth.uid() is not null);

-- Items / rooms / spots: household-scoped everything
create policy "household items read"   on items for select using (household_id = my_household_id());
create policy "household items insert" on items for insert with check (household_id = my_household_id());
create policy "household items update" on items for update using (household_id = my_household_id());
create policy "household items delete" on items for delete using (household_id = my_household_id());

create policy "household rooms all" on custom_rooms for all
  using (household_id = my_household_id())
  with check (household_id = my_household_id());

create policy "household spots all" on custom_spots for all
  using (household_id = my_household_id())
  with check (household_id = my_household_id());

-- ---------- Realtime ----------
-- In the dashboard: Database → Replication → enable realtime on `items`.

-- ---------- Join-by-invite-code ----------
-- Looking up a household by invite code needs to bypass the member-only
-- read policy. Do it with a security-definer RPC, not a broad policy:

create or replace function join_household(code text)
returns uuid language plpgsql security definer as $$
declare hid uuid;
begin
  select id into hid from households where invite_code = code;
  if hid is null then
    raise exception 'Invalid invite code';
  end if;
  update profiles set household_id = hid where id = auth.uid();
  return hid;
end;
$$;
