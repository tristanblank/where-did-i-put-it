-- Stop bulk bookkeeping rewrites from looking like someone touched the row.
--
-- The home screen's "Recent updates" tile is sorted by updated_at, which
-- is deliberate: an item someone *moved* belongs there just as much as one
-- freshly stashed. That only works if updated_at means "a person changed
-- this".
--
-- Two things break that, and neither involves anyone touching an item:
--
--   rename_room() rewrites items.room for every item in the room, so
--   renaming a room with five items floats all five to the top of the
--   tile, none of them moved.
--
--   delete_own_account() drops an auth.users row, and the FK cascade nulls
--   items.created_by on everything that person ever added — so their items
--   all jump to the top the moment they leave.
--
-- A column-level check in the trigger can't tell these apart from real
-- edits: a rename and a genuine move are both `update items set room`.
-- So the callers declare it instead, via a transaction-local flag the
-- trigger honours. set_config's third argument is is_local — the setting
-- is discarded at the end of the transaction, so it cannot leak into an
-- unrelated statement even if a function raises partway through.

create or replace function set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- Only meaningful on UPDATE; an INSERT is always a real write.
  if TG_OP = 'UPDATE' and coalesce(current_setting('app.bulk_rewrite', true), '') = 'on' then
    new.updated_at = old.updated_at;
    return new;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create or replace function rename_room(p_old_name text, p_new_name text)
returns void language plpgsql security definer set search_path = public as $$
declare hid uuid := my_household_id();
begin
  if hid is null then
    raise exception 'Not in a household';
  end if;

  if p_old_name = p_new_name then
    return;
  end if;

  -- Everything below rewrites a location label wholesale; none of it is
  -- anyone moving anything.
  perform set_config('app.bulk_rewrite', 'on', true);

  update items set room = p_new_name where household_id = hid and room = p_old_name;
  update custom_spots set room = p_new_name where household_id = hid and room = p_old_name;

  update custom_rooms set name = p_new_name where household_id = hid and name = p_old_name
    and not exists (select 1 from custom_rooms where household_id = hid and name = p_new_name);
  delete from custom_rooms where household_id = hid and name = p_old_name;

  update room_meta set room = p_new_name where household_id = hid and room = p_old_name
    and not exists (select 1 from room_meta where household_id = hid and room = p_new_name);
  delete from room_meta where household_id = hid and room = p_old_name;

  perform set_config('app.bulk_rewrite', 'off', true);
end;
$$;

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

  -- The cascade from auth.users nulls items.created_by on every item this
  -- person added. Those items are unchanged from the household's point of
  -- view and shouldn't resurface as recent activity.
  perform set_config('app.bulk_rewrite', 'on', true);
  delete from auth.users where id = auth.uid();
  perform set_config('app.bulk_rewrite', 'off', true);
end;
$$;
