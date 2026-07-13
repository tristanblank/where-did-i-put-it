-- Where Did I Put It? — Phase 4 schema
-- Run in the Supabase SQL editor. Review before running; adjust as the
-- app evolves. RLS is the entire security model — test it deliberately,
-- with two separate dummy accounts, before trusting it.

-- ---------- Tables ----------

create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  invite_code text unique not null default substr(md5(random()::text), 1, 8),
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  household_id uuid references households(id) on delete set null,
  display_name text check (char_length(display_name) <= 200),
  created_at timestamptz not null default now()
);

create table items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  room text not null check (char_length(room) between 1 and 100),
  spot text check (char_length(spot) <= 100),
  pos text check (char_length(pos) <= 100),
  container text check (char_length(container) <= 200),
  note text check (char_length(note) <= 2000),
  created_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);

create table custom_rooms (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  updated_at timestamptz not null default now(),
  unique (household_id, name)
);

create table custom_spots (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  room text not null check (char_length(room) between 1 and 100),
  name text not null check (char_length(name) between 1 and 100),
  updated_at timestamptz not null default now(),
  unique (household_id, room, name)
);

-- Per-room overrides for the Phase 3 room-management feature (hide a
-- default room, recolor its icon) — these need to sync across phones too,
-- or the two phones' home screens visibly disagree.
create table room_meta (
  household_id uuid not null references households(id) on delete cascade,
  room text not null check (char_length(room) between 1 and 100),
  icon text check (char_length(icon) <= 16),
  hidden boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (household_id, room)
);

create index items_household_idx on items (household_id, updated_at desc);

-- custom_rooms/custom_spots key on `id` (a separate uuid) but the app
-- identifies rows by name/room+name, not that id. Postgres's default
-- replica identity only includes primary-key columns in a realtime DELETE
-- payload — without this, a delete event would arrive with only `{id}`,
-- not the name the client actually needs to remove the right local row.
-- items/room_meta don't need this: their primary key already is the
-- column(s) the client keys on.
alter table custom_rooms replica identity full;
alter table custom_spots replica identity full;

-- ---------- updated_at bookkeeping ----------
-- Server-set, not client-set: sync's last-write-wins arbitration relies on
-- this being the server clock, not two phones' possibly-skewed clocks.

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger items_set_updated_at before insert or update on items
  for each row execute function set_updated_at();
create trigger custom_rooms_set_updated_at before insert or update on custom_rooms
  for each row execute function set_updated_at();
create trigger custom_spots_set_updated_at before insert or update on custom_spots
  for each row execute function set_updated_at();
create trigger room_meta_set_updated_at before insert or update on room_meta
  for each row execute function set_updated_at();

-- ---------- Row Level Security ----------

alter table households enable row level security;
alter table profiles enable row level security;
alter table items enable row level security;
alter table custom_rooms enable row level security;
alter table custom_spots enable row level security;
alter table room_meta enable row level security;

-- ---------- Base table grants ----------
-- RLS only filters *rows* — it does nothing without the base table-level
-- privilege underneath it. Supabase projects normally auto-grant this to
-- new public-schema tables, but don't assume it silently happened; state
-- it explicitly so this file is self-contained and reproducible. Nothing
-- is granted to `anon` — every screen in this app sits behind sign-in, so
-- there's no legitimate unauthenticated data access to allow for.

grant select, insert on households to authenticated;
grant select, insert, update on profiles to authenticated;
grant select, insert, update, delete on items to authenticated;
grant select, insert, update, delete on custom_rooms to authenticated;
grant select, insert, update, delete on custom_spots to authenticated;
grant select, insert, update, delete on room_meta to authenticated;

-- A new auth.users row (first sign-in, any provider) needs a matching
-- profiles row before create_household/join_household can do anything —
-- both just UPDATE profiles by id, which silently affects zero rows if
-- that row doesn't exist yet. Standard Supabase pattern: trigger it.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Helper: the current user's household
create or replace function my_household_id()
returns uuid language sql stable security definer set search_path = public as $$
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

-- Items / rooms / spots / room prefs: household-scoped everything
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

create policy "household room_meta all" on room_meta for all
  using (household_id = my_household_id())
  with check (household_id = my_household_id());

-- ---------- Realtime ----------
-- In the dashboard: Database → Replication → enable realtime on
-- `items`, `custom_rooms`, `custom_spots`, and `room_meta`.

-- ---------- Household creation / join-by-invite-code ----------
-- Both bypass or extend the member-only policies above, and both need to
-- be atomic (create-then-assign, or a multi-table rename) so a dropped
-- connection mid-operation can't leave things half-done. Security-definer
-- RPCs, not broad policies.

create or replace function create_household(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  insert into households (name) values (p_name) returning id into hid;
  update profiles set household_id = hid where id = auth.uid();
  return hid;
end;
$$;

create or replace function join_household(code text)
returns uuid language plpgsql security definer set search_path = public as $$
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

-- Renaming a room touches items, custom_rooms, custom_spots, and
-- room_meta together — do it as one statement per table inside a single
-- function call, not four separate round-trips from the client. If the
-- new name already has a custom_rooms/room_meta row, that existing row
-- wins and the old one is dropped (matches the client's own logic for
-- reusing a name). Note: a spot name that exists under both the old and
-- new room already will raise a unique-constraint error here — that's an
-- intentionally unhandled edge case, surfaced to the user as a failed
-- rename rather than silently merged.
create or replace function rename_room(p_old_name text, p_new_name text)
returns void language plpgsql security definer set search_path = public as $$
declare hid uuid := my_household_id();
begin
  if hid is null then
    raise exception 'Not in a household';
  end if;

  update items set room = p_new_name where household_id = hid and room = p_old_name;
  update custom_spots set room = p_new_name where household_id = hid and room = p_old_name;

  update custom_rooms set name = p_new_name where household_id = hid and name = p_old_name
    and not exists (select 1 from custom_rooms where household_id = hid and name = p_new_name);
  delete from custom_rooms where household_id = hid and name = p_old_name;

  update room_meta set room = p_new_name where household_id = hid and room = p_old_name
    and not exists (select 1 from room_meta where household_id = hid and room = p_new_name);
  delete from room_meta where household_id = hid and room = p_old_name;
end;
$$;

-- Postgres grants EXECUTE on new functions to PUBLIC by default, but same
-- rule as the table grants above: state it explicitly rather than rely on
-- a default. All four require auth.uid(), so `anon` gets nothing.
grant execute on function my_household_id() to authenticated;
grant execute on function create_household(text) to authenticated;
grant execute on function join_household(text) to authenticated;
grant execute on function rename_room(text, text) to authenticated;
