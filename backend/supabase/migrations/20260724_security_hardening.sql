-- Security / performance hardening pass.
--
-- Everything here either *narrows* an existing privilege or is additive;
-- nothing widens what a signed-in user can already reach. schema.sql has
-- been updated to match, so a from-scratch run of that file produces this
-- same end state without needing this migration.

-- ---------- 1. Leftover PUBLIC execute grants ----------
-- schema.sql revokes PUBLIC execute from the five app RPCs but never did
-- for the trigger functions. Postgres grants EXECUTE to PUBLIC on every
-- new function, and PUBLIC includes anon -- so `handle_new_user` (which is
-- security-definer) and `set_updated_at` were both listed as anon-callable
-- via /rest/v1/rpc/. PostgREST doesn't actually expose functions returning
-- `trigger`, so neither was reachable in practice, but the grant has no
-- reason to exist either way.
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.set_updated_at() from public;
revoke execute on function public.rls_auto_enable() from public;

-- set_updated_at was the one function without a pinned search_path, which
-- is what makes a function resolvable to an attacker-controlled `now()` if
-- one ever ends up earlier on the path. pg_catalog is always searched
-- implicitly, so an empty path still resolves now().
alter function public.set_updated_at() set search_path = '';

-- ---------- 2. Table privileges ----------
-- Supabase's default privileges grant ALL on new public-schema tables to
-- anon and authenticated. schema.sql then grants the specific privileges
-- it wants on top -- but a grant alongside a broader one doesn't shadow
-- it, so anon was left holding TRUNCATE/TRIGGER/REFERENCES on all six
-- tables and authenticated held TRUNCATE/TRIGGER too. PostgREST only ever
-- issues SELECT/INSERT/UPDATE/DELETE so none of that was reachable over
-- the API, but it's privilege nobody intended to hand out.
--
-- Revoke to zero, then re-grant exactly what schema.sql specifies. Same
-- transaction, so there's no window where the app loses access.
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;

grant select, insert on households to authenticated;
-- profiles.household_id stays non-writable: the "own profile write" policy
-- has no WITH CHECK, so it reuses its USING clause -- which constrains
-- *which row* you can touch, not *what value* household_id ends up as.
-- This column-level grant is the thing that actually stops a signed-in
-- user from setting their own household_id to an arbitrary household and
-- walking straight past join_household()'s invite-code check.
grant select on profiles to authenticated;
grant update (display_name) on profiles to authenticated;
grant select, insert, update, delete on items to authenticated;
grant select, insert, update, delete on custom_rooms to authenticated;
grant select, insert, update, delete on custom_spots to authenticated;
grant select, insert, update, delete on room_meta to authenticated;

-- Stop the same thing recurring on the next table added to this schema.
alter default privileges in schema public revoke all on tables from anon;

-- ---------- 3. Policy scoping + per-row auth.uid() re-evaluation ----------
-- Two changes to every policy, neither of which alters who can see what:
--
-- `to authenticated` -- these were all implicitly `to public`, which means
-- Postgres evaluated them for anon too. Safe (my_household_id() returns
-- null for anon, and `x = null` is null, not true) but it made anon's
-- inability to read these tables a property of the *expression* rather
-- than of the policy, which is a thin thing to rest on.
--
-- `(select auth.uid())` -- an unwrapped auth.uid() in a policy is treated
-- as volatile-per-row and re-evaluated for every row scanned. Wrapping it
-- in a subselect makes it an InitPlan: evaluated once per statement.

drop policy "own profile read" on profiles;
drop policy "own profile write" on profiles;
drop policy "own profile insert" on profiles;

create policy "own profile read" on profiles for select
  to authenticated using (id = (select auth.uid()));
create policy "own profile write" on profiles for update
  to authenticated using (id = (select auth.uid()));
create policy "own profile insert" on profiles for insert
  to authenticated with check (id = (select auth.uid()));

drop policy "member read" on households;
drop policy "authenticated create" on households;

create policy "member read" on households for select
  to authenticated using (id = (select my_household_id()));
create policy "authenticated create" on households for insert
  to authenticated with check ((select auth.uid()) is not null);

drop policy "household items read" on items;
drop policy "household items insert" on items;
drop policy "household items update" on items;
drop policy "household items delete" on items;

create policy "household items read" on items for select
  to authenticated using (household_id = (select my_household_id()));
create policy "household items insert" on items for insert
  to authenticated with check (household_id = (select my_household_id()));
create policy "household items update" on items for update
  to authenticated using (household_id = (select my_household_id()));
create policy "household items delete" on items for delete
  to authenticated using (household_id = (select my_household_id()));

drop policy "household rooms all" on custom_rooms;
create policy "household rooms all" on custom_rooms for all
  to authenticated
  using (household_id = (select my_household_id()))
  with check (household_id = (select my_household_id()));

drop policy "household spots all" on custom_spots;
create policy "household spots all" on custom_spots for all
  to authenticated
  using (household_id = (select my_household_id()))
  with check (household_id = (select my_household_id()));

drop policy "household room_meta all" on room_meta;
create policy "household room_meta all" on room_meta for all
  to authenticated
  using (household_id = (select my_household_id()))
  with check (household_id = (select my_household_id()));

-- ---------- 4. Foreign-key covering indexes ----------
-- Both of these back an ON DELETE action (set null / set null), which
-- means deleting a profile or a household seq-scans the referencing table
-- without them.
create index if not exists items_created_by_idx on items (created_by);
create index if not exists profiles_household_idx on profiles (household_id);

-- ---------- 5. Invite codes ----------
-- Was substr(md5(random()::text), 1, 8). random() is a deterministic PRNG
-- seeded per session, not a CSPRNG -- fine for jitter, not for something
-- whose only job is to be unguessable. gen_random_bytes is pgcrypto's
-- CSPRNG; 4 bytes still encodes to exactly the 8 hex chars the existing
-- check constraint wants. pgcrypto lives in the `extensions` schema here,
-- so qualify it rather than depending on the inserting role's search_path.
alter table households
  alter column invite_code set default encode(extensions.gen_random_bytes(4), 'hex');

-- An invite code shared once -- texted, read aloud, screenshotted -- is
-- valid forever, and there was no way to invalidate it short of deleting
-- the household. Rotating needs to bypass both the missing UPDATE grant
-- and the missing UPDATE policy on households, hence security definer.
-- The retry loop covers the unique-violation birthday case; at 2^32 codes
-- it will effectively never run twice, but an unhandled 500 here would
-- surface to the user as "rotation failed" for no good reason.
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
      -- collision: go around again
    end;
  end loop;
end;
$$;

revoke execute on function rotate_invite_code() from public;
grant execute on function rotate_invite_code() to authenticated;

-- ---------- 6. create_household re-entry guard ----------
-- The client can only reach this screen when householdId is null, so this
-- shouldn't fire -- but a direct RPC call from an already-joined account
-- would otherwise silently repoint that profile at a brand-new household,
-- orphaning the old one and every item in it with no way back. Cheap
-- guard against a lot of unrecoverable damage.
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
