-- Household member names, and a way out of a household.

-- ---------- 1. Members can see each other ----------
-- profiles had exactly one read policy: `id = auth.uid()`. Airtight, and
-- it made items.created_by permanently unreadable -- the uuid resolves to
-- a row the reader isn't allowed to see, so "who added this" could never
-- be rendered no matter how correctly the column was populated.
--
-- This is the one policy in the app that widens access rather than
-- narrowing it. What it exposes to a household member: the other
-- members' display_name, household_id, created_at and id. Not email, not
-- provider, not anything else -- that all lives in auth.users, which no
-- client-facing role can read at all.
--
-- Note the null case is safe by construction: a user with no household
-- compares household_id = null, which is null rather than true, so
-- household-less profiles stay invisible to each other rather than
-- pooling into one big readable group.
--
-- No recursion risk despite this being a policy on profiles that depends
-- on a function reading profiles: my_household_id() is security definer,
-- so it runs as the table owner and isn't itself subject to RLS.
create policy "household members read" on profiles for select
  to authenticated using (household_id = (select my_household_id()));

-- ---------- 2. Leaving a household ----------
-- The last member out is the whole design problem here. Hard-deleting the
-- household would cascade to items/custom_rooms/custom_spots/room_meta,
-- and on the free plan there are no automatic backups and no PITR -- so a
-- mistaken tap would be unrecoverable, by anyone, permanently.
--
-- So: don't delete. Stamp abandoned_at and leave every row where it is.
-- The user's experience is identical to deletion (with no members,
-- my_household_id() is null for everyone, and every policy already
-- refuses the household and its contents) but the data survives, and the
-- invite code still resolves -- which makes rejoining with that code a
-- real undo, needing no database access from anyone.
--
-- delete_own_account() deliberately keeps its existing hard delete. That
-- one is an explicit request to destroy an account, and the person who
-- made it can't come back to rejoin anything; leaving rows behind there
-- would be an orphan, not a safety net.
alter table households add column if not exists abandoned_at timestamptz;

create or replace function leave_household()
returns void language plpgsql security definer set search_path = public as $$
declare
  hid uuid;
  remaining int;
begin
  select household_id into hid from profiles where id = auth.uid();
  if hid is null then
    return; -- not in one; nothing to do
  end if;

  update profiles set household_id = null where id = auth.uid();

  select count(*) into remaining from profiles where household_id = hid;
  if remaining = 0 then
    update households set abandoned_at = now() where id = hid;
  end if;
end;
$$;

revoke execute on function leave_household() from public;
grant execute on function leave_household() to authenticated;

-- Joining un-abandons: it's the recovery path for someone who left by
-- mistake, and equally the path for handing a household to someone else
-- after the last member has gone.
create or replace function join_household(code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  select id into hid from households where invite_code = code;
  if hid is null then
    raise exception 'Invalid invite code';
  end if;

  update profiles set household_id = hid where id = auth.uid();
  update households set abandoned_at = null where id = hid and abandoned_at is not null;

  return hid;
end;
$$;
