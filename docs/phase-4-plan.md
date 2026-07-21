# Phase 4 — Supabase Backend & Household Sync

## Context

Stasher (repo: `where-did-i-put-it`) has shipped Phases 0–3: a working iOS app on TestFlight, fully local (AsyncStorage only, one context — `app/lib/items-store.tsx` — owns everything: items, rooms, spots, hidden-rooms, room icons, theme). It's been in real daily use for a week logging real household items.

The actual point of this app is a **shared household inventory** — one person's own local storage doesn't deliver that. Phase 4 adds accounts, a household concept, and sync so both phones see the same data. The schema (`backend/supabase/schema.sql`) was drafted earlier but never applied to the live Supabase project, and needed a few additions before it did (see M0, and Implementation notes below).

Outcome: sign in with Apple (or email magic link) → create or join a household via invite code → existing local items migrate in automatically → both phones stay in sync, including offline.

## Architecture decisions

1. **`useItemsStore()`'s public interface doesn't change.** All four screens and `room-actions-sheet.tsx` keep working untouched. Sync logic lives inside `items-store.tsx` and new `lib/sync/*` modules.
2. **Sync is a dirty-id outbox, not an event log.** Each mutation marks its row dirty; a flush pushes the *current* local value. No CRDTs, no operation replay — last-write-wins, arbitrated by the server's `updated_at` (a DB trigger sets this, not the client clock, so device clock skew can't decide conflicts).
3. **Auth sits above Items** as a new sibling context (`AuthProvider`) — items need `householdId` from it, auth doesn't need items at all.
4. **Room hide/icon prefs sync too** (new `room_meta` table) — confirmed with the owner, since divergent per-phone room lists would undercut the whole point of a shared inventory.
5. **AsyncStorage stays** as the offline cache/fast-path exactly as it works today — sync is additive (a second effect on the existing `persist()`), not a replacement.

## Milestones

Seven nights-and-weekends-sized chunks, each independently shippable/testable. Only **M2** requires a new EAS development-client build (Sign in with Apple needs a native entitlement Expo Go can't provide); everything else reuses that same dev client or needs no build at all.

| # | Scope | New files | Modified files | Dev-client build? |
|---|---|---|---|---|
| M0 | Apply schema to live Supabase project: `room_meta(household_id, room, icon, hidden)` table + RLS; `create_household`/`rename_room` RPCs (security-definer, same pattern as `join_household`); `set_updated_at` trigger; `check` constraints on user-supplied text columns. Test RLS cross-household with two dummy users before moving on. | — | `backend/supabase/schema.sql` | No — SQL editor only |
| M1 | Supabase client + env plumbing | `app/lib/supabase.ts`, `app/.env.local`, `app/.env.example` | `app/package.json` (`@supabase/supabase-js`, `react-native-url-polyfill`) | No — Expo Go |
| M2 | Auth: Sign in with Apple + email magic link, session restore, root-layout gating | `app/lib/auth-store.tsx`, `app/app/sign-in.tsx` | `app/app.json` (`expo-apple-authentication` plugin), `app/app/_layout.tsx`, `app/package.json` | **Yes** |
| M3 | Household create/join screen + gating | `app/app/household-setup.tsx` | `app/app/_layout.tsx` | No |
| M4 | Sync engine (outbox + reconcile) wired into items-store; switch new-item IDs to real UUIDs | `app/lib/sync/outbox.ts`, `app/lib/sync/reconcile.ts` | `app/lib/items-store.tsx` | No |
| M5 | One-time legacy local→cloud migration, triggered only on create-household | `app/lib/migrate-legacy-data.ts` | `app/app/household-setup.tsx` | No |
| M6 | Realtime subscription (`items`, `custom_rooms`, `custom_spots`, `room_meta`) + initial fetch on join | `app/lib/sync/realtime.ts` | `app/lib/items-store.tsx` | No |

## Key patterns (apply once, reused across the sync work)

- **Env vars:** `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` (safe to embed client-side — RLS is the real protection, not secrecy). `.env.local` covers `expo start`/dev-client, but **`eas build` needs the same two vars registered separately via `eas env:create`** — otherwise a cloud build silently ships with `undefined` and fails at runtime, not build time. Test this deliberately once.
- **Outbox flush:** reuses the serialized-write-queue pattern already in `items-store.tsx`'s `persist()`. On push failure, stops draining that table and retries on app-foreground / a flat 30s timer / after a flush that was requested while one was already running.
- **Reconcile:** skips applying an incoming (fetched or realtime) row if its key is in the dirty set — that's the entire conflict-resolution logic. Everything else about "who wins" is decided server-side by `updated_at`.
- **Multi-table room ops** (`renameRoom` touches `items` + `custom_rooms` + `custom_spots` + `room_meta`) go through the `rename_room` RPC, not four separate client calls, so a mid-op disconnect can't leave them inconsistent. Unlike item writes, this requires connectivity — rare enough that it's a fine trade against the complexity of making a 4-table atomic operation offline-queueable.
- **Realtime lifecycle:** subscribes in a `useEffect` keyed on `householdId`, always `removeChannel` in cleanup. An initial fetch runs alongside the subscription, since realtime only streams changes from the moment of subscription onward — without it, a spouse joining an established household would see nothing until something next changed.
- **Migration idempotency:** guarded by a `stasher:migration:v1:done` flag; a missing legacy `stasher:data` key (the spouse's fresh install) is a no-op by construction, not a special case.

## Security

Explicit per the owner's own standing rules (RLS tested deliberately, input validated server-side, rate limiting on auth/writes, no hardcoded secrets):

- **RLS is the actual access-control boundary**, not the client. M0's checkpoint tests it adversarially with two dummy accounts, not just "does my own account work."
- **Input validation moves server-side, not just client-side.** `check` constraints alongside the `not null`s already there: non-empty/length-capped `name` on `items`, `households`, `custom_rooms`, `custom_spots`, `room_meta` — the DB rejects a garbage row even if a buggy or malicious client sends one, not just the app's UI.
- **Auth rate limiting: Supabase's built-in limits, not custom.** Supabase Auth already rate-limits OTP/magic-link sends and sign-in attempts per-email and per-IP by default (dashboard: Auth → Rate Limits) — worth confirming these are on, not disabled for testing convenience and forgotten.
- **Write-rate-limiting beyond RLS+auth is intentionally not built.** Every write requires an authenticated session tied to a specific household (RLS-enforced), not public/anonymous access — the abuse surface a public API needs defending against doesn't apply to a 2-person private household.
- **Secrets stay out of the client.** The anon key is safe to embed (that's Supabase's design — RLS is what protects data behind it); the DB password (`backend/supabase/.env`) and any future service-role key are tooling-only and never enter `app/`.
- **Nonce-verified Apple sign-in + PKCE magic links** — prevents token-substitution and link-leakage attacks respectively.
- All security-definer functions (`my_household_id`, `create_household`, `join_household`, `rename_room`, `handle_new_user`) pin `search_path = public` — an unset search_path on a SECURITY DEFINER function is a known hijack vector (Supabase's database linter flags this).

## Implementation notes (found during build, not in the original plan)

- **Base table grants were missing.** Supabase normally auto-grants `anon`/`authenticated` privileges on new public-schema tables, but this project didn't have them — RLS alone doesn't grant access, it only filters rows on top of a base grant. Fixed with explicit `grant` statements; `anon` intentionally gets nothing, since every screen in this app sits behind sign-in.
- **No trigger created a `profiles` row on signup.** `create_household`/`join_household` both `UPDATE profiles ... WHERE id = auth.uid()`, which silently affects zero rows if that row doesn't exist. Added the standard Supabase `handle_new_user()` trigger on `auth.users`.
- **`custom_rooms`/`custom_spots` needed `REPLICA IDENTITY FULL`.** Their primary key is a separate `id` column, not the `name`/`room+name` the app actually keys on. Postgres's default replica identity only includes primary-key columns in a realtime DELETE payload — without this, a delete event would arrive with just `{id}`, not the name needed to remove the right local row. `items` and `room_meta` don't need this — their primary key already is the column(s) the client keys on.
- **`create_household` never surfaced its own invite code.** `household-setup.tsx` called `refreshHouseholdId()` right after creation, which flips the root layout's `Stack.Protected` guard straight to the home screen — there was no moment where the code was ever fetched or shown, so a household could be created with no way to actually invite anyone into it. Fixed with a `created` step that fetches `invite_code` and shows it with a share-sheet button; navigation to home now waits for an explicit "Continue" tap instead of happening automatically.

## Critical files

- `app/lib/items-store.tsx` — where most of the real work lands
- `app/app/_layout.tsx` — auth/household gating
- `backend/supabase/schema.sql` — M0's additions
- `app/app.json`, `app/eas.json` — Apple Sign-In plugin, EAS env vars
- `app/package.json` — new deps

## Verification

Each milestone has its own checkpoint — don't move to the next until the current one is confirmed:

- **M0:** query the new tables/policies directly in the Supabase SQL editor as two different dummy `auth.uid()`s; confirm cross-household reads are denied.
- **M1:** a temporary `supabase.from('households').select('count')` call round-trips (even an RLS-denied response confirms wiring) — then remove it.
- **M2:** sign in both ways, kill and relaunch the app, confirm still signed in.
- **M3:** fresh sign-in forces `household-setup`; create → lands on home; a second account joining by code lands on home seeing the same data.
- **M4:** airplane mode on, add an item, confirm instant local UI update; airplane mode off, confirm it lands in the Supabase table editor within seconds.
- **M5:** sign in on the owner's real phone (the one with actual Phase-3 data), create the household, confirm every pre-existing item shows up correctly on-screen and in the table editor under the new `household_id`.
- **M6:** the ship plan's own Phase 4 checkpoint — two phones signed into the same household, stash on one, watch it appear on the other within a couple seconds.
