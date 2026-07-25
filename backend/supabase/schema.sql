-- Where Did I Put It? — Phase 4 schema
-- Run in the Supabase SQL editor. Review before running; adjust as the
-- app evolves. RLS is the entire security model — test it deliberately,
-- with two separate dummy accounts, before trusting it.

-- ---------- Tables ----------

-- invite_code uses pgcrypto's CSPRNG, not random(): random() is a
-- deterministic PRNG seeded per session, which is fine for jitter and
-- wrong for the one value whose entire job is being unguessable. 4 bytes
-- encodes to exactly the 8 hex chars the check constraint wants. pgcrypto
-- lives in the `extensions` schema on Supabase, so qualify it rather than
-- depending on the inserting role's search_path.
create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  invite_code text unique not null default encode(extensions.gen_random_bytes(4), 'hex')
    check (char_length(invite_code) = 8),
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
  created_by uuid references profiles(id) on delete set null,
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

-- Both of these back an FK with an ON DELETE action (set null). Without a
-- covering index, deleting a profile or a household seq-scans the whole
-- referencing table to find what to null out.
create index items_created_by_idx on items (created_by);
create index profiles_household_idx on profiles (household_id);

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

-- search_path is pinned even though this function only calls now(): an
-- unpinned path is what lets a function resolve to something an attacker
-- planted earlier on the path. Empty is enough here -- pg_catalog is
-- always searched implicitly, so now() still resolves.
create or replace function set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
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
--
-- Revoke to zero first. Supabase's default privileges hand out ALL on new
-- public-schema tables to anon and authenticated, and a narrower grant
-- alongside a broader one doesn't shadow it — it just sits next to it. So
-- without this, `anon` keeps TRUNCATE/TRIGGER/REFERENCES on every table
-- below and `authenticated` keeps TRUNCATE/TRIGGER on top of the four
-- verbs it's actually meant to have. PostgREST never issues any of those,
-- so none of it is reachable over the API, but privilege nobody asked for
-- shouldn't be sitting there waiting for the day something else can.
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;

-- ...and stop it recurring on whatever table gets added next.
alter default privileges in schema public revoke all on tables from anon;

grant select, insert on households to authenticated;
-- profiles.household_id is deliberately NOT client-writable: an UPDATE
-- policy with no explicit WITH CHECK reuses its USING clause, and "own
-- profile write" below only checks `id = auth.uid()` — that constrains
-- which row can be touched, not what value household_id ends up with. A
-- plain `update` grant would let any signed-in user set their own
-- household_id to any household's uuid directly, bypassing
-- join_household()'s invite-code check entirely. Restricting the grant to
-- display_name closes that off without needing a WITH CHECK subquery;
-- household_id only ever changes via the security-definer RPCs below,
-- which run as table owner and aren't subject to this grant. No `insert`
-- grant either — handle_new_user() is the only thing that creates a
-- profiles row, and it's security-definer too.
grant select on profiles to authenticated;
grant update (display_name) on profiles to authenticated;
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

-- Two conventions hold for every policy below.
--
-- `to authenticated`: without it a policy is implicitly `to public`, and
-- Postgres evaluates it for `anon` too. That happens to be safe here —
-- my_household_id() returns null for anon and `x = null` is null, not
-- true — but it makes anon's inability to read this data a property of
-- the expression rather than of the policy, which is a thin thing to rest
-- on. Say who the policy is for.
--
-- `(select auth.uid())` rather than a bare `auth.uid()`: unwrapped, it's
-- treated as volatile-per-row and re-evaluated for every row scanned.
-- Wrapped in a subselect it becomes an InitPlan — evaluated once per
-- statement. Same for my_household_id(), which is STABLE and so already
-- cached within a statement, but reads consistently this way.

-- Profiles: users manage only their own row
create policy "own profile read"  on profiles for select
  to authenticated using (id = (select auth.uid()));
create policy "own profile write" on profiles for update
  to authenticated using (id = (select auth.uid()));
create policy "own profile insert" on profiles for insert
  to authenticated with check (id = (select auth.uid()));

-- Households: members can read their own household
create policy "member read" on households for select
  to authenticated using (id = (select my_household_id()));
create policy "authenticated create" on households for insert
  to authenticated with check ((select auth.uid()) is not null);

-- Items / rooms / spots / room prefs: household-scoped everything
create policy "household items read"   on items for select
  to authenticated using (household_id = (select my_household_id()));
create policy "household items insert" on items for insert
  to authenticated with check (household_id = (select my_household_id()));
create policy "household items update" on items for update
  to authenticated using (household_id = (select my_household_id()));
create policy "household items delete" on items for delete
  to authenticated using (household_id = (select my_household_id()));

create policy "household rooms all" on custom_rooms for all
  to authenticated
  using (household_id = (select my_household_id()))
  with check (household_id = (select my_household_id()));

create policy "household spots all" on custom_spots for all
  to authenticated
  using (household_id = (select my_household_id()))
  with check (household_id = (select my_household_id()));

create policy "household room_meta all" on room_meta for all
  to authenticated
  using (household_id = (select my_household_id()))
  with check (household_id = (select my_household_id()));

-- ---------- Realtime ----------
-- In the dashboard: Database → Replication → enable realtime on
-- `items`, `custom_rooms`, `custom_spots`, and `room_meta`.

-- ---------- Household creation / join-by-invite-code ----------
-- Both bypass or extend the member-only policies above, and both need to
-- be atomic (create-then-assign, or a multi-table rename) so a dropped
-- connection mid-operation can't leave things half-done. Security-definer
-- RPCs, not broad policies.

-- The re-entry guard shouldn't ever fire from the app — household-setup
-- is only reachable while householdId is null. It's here for the direct
-- RPC call: without it, an already-joined account calling this again
-- silently repoints its profile at a brand-new household, orphaning the
-- old one and every item in it with no path back. Cheap guard, a lot of
-- unrecoverable damage on the other side of it.
create or replace function create_household(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if my_household_id() is not null then
    raise exception 'Already in a household';
  end if;

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

-- An invite code that's been shared once — texted, read aloud over the
-- phone, left in a screenshot — is valid forever, and before this there
-- was no way to invalidate one short of deleting the household outright.
-- Rotating has to bypass both the missing UPDATE grant and the missing
-- UPDATE policy on households, so: security definer, like the rest.
-- The retry loop is for the unique-violation case; at 2^32 codes and a
-- household count in the single digits it will effectively never go
-- around twice, but an unhandled 23505 would surface to the user as a
-- failed rotation for no reason worth explaining to them.
create or replace function rotate_invite_code()
returns text language plpgsql security definer set search_path = public as $$
declare
  hid uuid := my_household_id();
  new_code text;
begin
  if hid is null then
    raise exception 'Not in a household';
  end if;

  loop
    new_code := encode(extensions.gen_random_bytes(4), 'hex');
    begin
      update households set invite_code = new_code where id = hid;
      return new_code;
    exception when unique_violation then
      null; -- collision: go around again
    end;
  end loop;
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

  -- Without this, a same-name call still passes every "not exists" guard
  -- below (the row already matches p_new_name) but the unconditional
  -- DELETE right after each guard doesn't know that, and removes the
  -- custom_rooms/room_meta row anyway -- silently losing that room's icon
  -- and hidden state for a rename that changed nothing.
  if p_old_name = p_new_name then
    return;
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

-- Apple requires in-app account deletion for any app that supports account
-- creation (App Store Review Guideline 5.1.1(v)). The client only ever
-- holds the anon key, which can't delete an auth.users row directly --
-- that needs the same security-definer pattern as the RPCs above, running
-- with the function owner's elevated privileges rather than the caller's.
-- Deleting auth.users cascades to profiles (on delete cascade, defined
-- above) and to Supabase's own auth-schema tables; items.created_by is
-- on delete set null, not cascade, so a household's shared items survive
-- one member deleting their account -- only the "who added this" link is
-- cleared, not the item itself.
--
-- Nothing else cascades from profiles to households, though -- if the
-- last member of a household deleted their account, the household and
-- everything in it would otherwise sit forever, orphaned but never
-- actually deleted. So: check membership count first, and if this is the
-- last one out, delete the household too (which cascades to items/
-- custom_rooms/custom_spots/room_meta via their own existing FKs).
create or replace function delete_own_account()
returns void language plpgsql security definer set search_path = public as $$
declare
  hid uuid;
  remaining_members int;
begin
  select household_id into hid from profiles where id = auth.uid();

  if hid is not null then
    select count(*) into remaining_members from profiles where household_id = hid and id <> auth.uid();
    if remaining_members = 0 then
      delete from households where id = hid;
    end if;
  end if;

  delete from auth.users where id = auth.uid();
end;
$$;

-- Postgres grants EXECUTE on new functions to PUBLIC by default -- and
-- PUBLIC is a pseudo-role every role, including anon, is implicitly a
-- member of. That default has to be explicitly revoked, not just
-- shadowed by an authenticated-only grant alongside it, or anon can still
-- call these directly with no session at all. create_household is the
-- concrete exploit: it inserts into households before ever touching
-- auth.uid(), so an unauthenticated caller could spam junk rows into it
-- with nothing but the public anon key.
--
-- The trigger functions need this too. PostgREST doesn't expose functions
-- returning `trigger`, so neither was callable in practice — but that's a
-- property of PostgREST's routing, not of the grant, and the grant is what
-- the database actually enforces. Revoke both rather than relying on a
-- layer above to keep declining to route to them.
revoke execute on function my_household_id() from public;
revoke execute on function create_household(text) from public;
revoke execute on function join_household(text) from public;
revoke execute on function rotate_invite_code() from public;
revoke execute on function rename_room(text, text) from public;
revoke execute on function delete_own_account() from public;
revoke execute on function handle_new_user() from public;
revoke execute on function set_updated_at() from public;

grant execute on function my_household_id() to authenticated;
grant execute on function create_household(text) to authenticated;
grant execute on function join_household(text) to authenticated;
grant execute on function rotate_invite_code() to authenticated;
grant execute on function rename_room(text, text) to authenticated;
grant execute on function delete_own_account() to authenticated;
