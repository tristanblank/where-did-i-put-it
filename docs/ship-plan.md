# "Stasher" — App Store Ship Plan

A step-by-step execution plan, sequenced so you always have something working. Each phase ends with a checkpoint you can actually verify. Estimated pace: nights-and-weekends with a newborn, so phases are small.

---

## Phase 0 — Accounts & Setup (1 evening)

1. [x] Enroll in the **Apple Developer Program** ($99/yr) at developer.apple.com. Do this first — enrollment approval can take a day or two, and it blocks TestFlight later.
2. [x] Create an **Expo account** (expo.dev) and install the tooling on your machine:
   - Node.js (LTS version)
   - `npm install -g eas-cli`
3. [ ] Create a **Supabase account** (supabase.com) and spin up a free project. Name it, save the project URL and anon key somewhere safe. You won't touch it again until Phase 4.
4. [x] Create a GitHub repo for the project.

**Checkpoint:** Apple enrollment confirmed, `eas --version` runs, empty Supabase project exists.
**Status:** Apple Developer Program active, `eas-cli` installed globally and logged in, GitHub repo live at github.com/tristanblank/where-did-i-put-it. Supabase account still pending — not needed until Phase 4.

---

## Phase 1 — Scaffold the App (1 weekend)

1. Scaffold: `npx create-expo-app where-did-i-put-it` (choose the default template with Expo Router).
2. Run it on your actual phone via the **Expo Go** app — scan the QR code, see the starter screen. This is your dev loop from now on: save file, phone updates instantly.
3. Decide on styling: install **NativeWind** if you want to keep Tailwind-style classes from the bento prototype, or use plain StyleSheet objects.
4. Set up the basic navigation shell: Home (bento grid), Room view, Add Item, Item Detail. Four screens, matching the prototype.
5. Add the **Encode Sans Semi Expanded** font via `expo-font` / `@expo-google-fonts/encode-sans-semi-expanded`.

**Checkpoint:** App runs on your phone with four navigable (empty) screens in your fonts and colors.

---

## Phase 2 — Port the Prototype (1–2 weekends)

Work from the bento artifact — the logic ports directly, the JSX needs translation (`div` → `View`, `button` → `Pressable`, `input` → `TextInput`, text always wrapped in `<Text>`).

1. Port the **data model**: items with `{name, room, spot, position, container, note, updatedAt}`, plus custom rooms/spots.
2. Port the **Add Item flow**: room chips → spot chips → position chips → container/note fields → live label preview.
3. Port the **bento home**: stat tile, add tile, room tiles with counts (busiest rooms span full width), recently-stashed tile.
4. Port **search** and the **room drill-down** view.
5. Port the **label path** component — your signature element.
6. Replace `window.storage` with **AsyncStorage** (`@react-native-async-storage/async-storage`) — same get/set JSON pattern, nearly identical code.
7. Port the **light/dark theme** toggle; persist the preference.

**Checkpoint:** The full prototype experience works natively on your phone, data survives app restarts. *This is a usable app — start actually using it at home now. Real usage will surface UX problems no amount of planning will.*

---

## Phase 3 — First TestFlight Build (1 evening + waiting)

Ship with local-only storage. Sync comes later.

1. [x] Configure `app.json`: app name, bundle identifier (`com.tb.wheredidiputit`), version 1.0.0.
2. [x] Make an app icon (1024×1024) and splash screen — stacked-crates-and-location-pin mark on the brand cobalt background.
3. [x] Run `eas build --platform ios` then `eas submit` — build is live in App Store Connect.
4. [x] In **App Store Connect**, create the app record ("Stasher - Home Inventory" — "Stasher" alone was already taken) and enable **TestFlight**.
5. [ ] Install via TestFlight on both phones — confirmed working on Tristan's; wife not yet added as a tester.

**Checkpoint:** Both of you running the app from TestFlight. Use it for 1–2 weeks. Log every annoyance in a note — that's your polish backlog.
**Status:** Pipeline proven end-to-end (build → submit → TestFlight install confirmed working). First polish-backlog item already shipped: long-press a room tile to rename it, change its icon, or delete it (only when empty) — added because default rooms like "Nursery" don't fit every household.

---

## Phase 4 — Supabase Backend & Household Sync (2 weekends)

This is the feature that justifies the app existing: shared household inventory.

1. [x] **Schema** (in Supabase SQL editor):
   - `households` (id, name, invite_code)
   - `profiles` (id → auth user, household_id) + an `on_auth_user_created` trigger that creates this row automatically on signup
   - `items` (id, household_id, name, room, spot, position, container, note, updated_at)
   - `custom_rooms` / `custom_spots` / `room_meta` (household_id scoped — `room_meta` covers the Phase 3 hide-room/change-icon feature, which needed its own table to sync)
   - `create_household` / `join_household` / `rename_room` RPCs (security-definer, so multi-table operations can't half-fail)
2. [x] Row Level Security on every table, plus explicit base-table grants and `search_path`-hardened functions (Supabase's default grants didn't apply automatically on this project — had to be stated explicitly rather than assumed).
3. [x] **Auth**: Sign in with Apple (`expo-apple-authentication`, nonce-verified) + email one-time code (PKCE flow) via Supabase auth. Root layout gates on session + household via `Stack.Protected`. Both email templates send a code and no link — see `backend/supabase/auth-config.md` for why, and for the dashboard settings this repo can't reproduce.
4. [x] **Household join flow**: create household → get invite code → wife enters code → same data. Screen: `app/app/household-setup.tsx`.
5. [x] Items CRUD wired to Supabase with AsyncStorage as an offline cache — a dirty-key outbox queues writes made offline and pushes them when connectivity returns (`app/lib/sync/`). One-time migration (`app/lib/migrate-legacy-data.ts`) pushes existing local Phase-3 data into the household the first time it's created.
6. [x] Supabase Realtime on `items`, `custom_rooms`, `custom_spots`, `room_meta`, with an initial fetch on join (realtime alone only streams changes from the moment of subscription, so a joining spouse needs the initial fetch to see what's already there).

**Status:** All milestones confirmed live on-device — M0 through M6, done.
- [x] **M0** — verified directly via SQL editor checks (RLS, grants, policies, triggers, `search_path`-pinned functions, replica identity, realtime publication all confirmed)
- [x] **M2** — both auth paths confirmed, including sign-out/sign-in persistence: Sign in with Apple, and email one-time code. (The magic link was the original design and is gone: it was fragile on mobile, and because a link and its code are the same one-time token, a link that failed to complete silently spent the code too. Phase 5 replaced it entirely.)
- [x] **M4** — airplane-mode write test: add/edit an item offline, instant local UI update, syncs to Supabase within seconds of reconnecting
- [x] **M5** — legacy migration: pre-existing local items from the real device correctly migrated into the new household on creation, confirmed both on-screen and in the Supabase table editor
- [x] **M6** — two-phones-same-household realtime test: stash on one phone, appears on the other in close to real time

Bugs found and fixed along the way: a stray `/rest/v1/` suffix on `EXPO_PUBLIC_SUPABASE_URL`, the Apple auth provider not yet enabled in the Supabase dashboard, `create_household` never surfacing its own invite code (now shown at creation and any time after, via a 👥 button on the home screen), and a realtime subscription that went stale after the app backgrounded — fixed with an `AppState`-triggered refetch on foreground, which is also what took M6 from "works after a relaunch" to "works in near real time."

Afterward, ran a 3-agent security review (Supabase/RLS, client-side sync code, config/secrets hygiene) against the whole Phase 4 codebase. Git history and `.gitignore` hygiene came back clean; what didn't: an outbox race that could silently drop a rapid second edit or delete, missing client-side input-length limits that could permanently stall the sync outbox on one oversized field, a duplicate-household risk if migration failed partway through a retry, and a real RLS gap (`profiles.household_id` had no `WITH CHECK`, letting a client bypass `join_household()`'s invite-code check entirely). All fixed and applied live.

**Checkpoint:** ✅ Achieved — you stash an item, it appears on your wife's phone within seconds. Sign-out/sign-in preserves data.

---

## Phase 5 — Store Readiness (1 weekend)

1. [x] Write a **privacy policy** (required). Written against the actual schema rather than a template — `docs/privacy-policy.md`, served by GitHub Pages, plus a support page since Support URL is a separate required field.
2. [x] Fill in App Store Connect: description, keywords, category, the **privacy nutrition label** (Email Address, Name, Other User Content, User ID — all App Functionality, all Linked, no tracking). Copy and every field's location recorded in `docs/app-store-listing.md`.
3. [x] **Screenshots** at 6.9", 6.7" and 6.5". Shot on a physical phone — there's no iOS Simulator on Windows — and resized by `app/scripts/store-screenshots.js`.
4. [x] Final QA pass — `docs/phase-5-qa-checklist.md`. 25 of 29, the rest either blocked on a second provisioned device or knowingly accepted.
5. [x] Production build, `eas submit`, **submitted for review**.

**Checkpoint:** ✅ Submitted 31 July 2026, build 4 from commit `0a65f26`, manual release selected.

**Status:** The QA pass found eleven bugs, seven of which would have shipped silently — every one passed `tsc` and `expo lint`, and several passed SQL verification too. Only running the app on a phone surfaced them; the single most valuable find (a rename appearing as a duplicate room on the second device) came from ten minutes of real two-person use.

Also fixed here: the production build had no `EXPO_PUBLIC_*` environment variables registered with EAS, which would have crashed it on launch and earned a 2.1 rejection. Preview and production bundle their JS on EAS servers, where `.env.local` doesn't exist.

Two things shipped knowingly: a create-then-rename race that briefly shows a duplicate room on a second device (cosmetic, self-healing, server converges correctly — see the rooms debt above), and screenshots that predate the "Add a room" tile.

---

## Phase 6 — Review & Launch

1. [x] Expect 1–2 days for review. If rejected, read the note carefully — it's almost always something small (broken privacy link, missing account deletion, vague permission text). Fix, resubmit; turnaround on resubmission is usually fast.
2. [x] Release manually (recommended) so launch happens when you choose.
3. [ ] Post-launch: watch Supabase logs and crash reports (add **Sentry** via `sentry-expo` in a point release if you want proper crash visibility).

**Checkpoint:** ✅ Live on the App Store 17 August 2026, 19:11 UTC —
"Stasher - Home Inventory", `id6788215703`, version 1.0.

Rejected once under **guideline 2.1 (Information Needed)** — seven written
questions plus a screen recording, no code change required. Answered in
the Resolution Center; the reply is `docs/app-review-reply.md`, and the
same text now lives in App Review Information → Notes so the next
submission doesn't ask again. Approved on the reply alone, without a new
build.

Two things learned at release, both worth knowing next time:

- **"Available" in the territory list is not the release indicator.** It
  describes where the app *would* be sold and reads Available while a
  version still sits in Pending Developer Release. The status that
  answers "is it live" is **Ready for Distribution** on the version page.
- **The product page goes live immediately; search indexing does not.**
  For hours after release a bundle-id lookup returned the app while
  searching its own name returned nothing. That gap is normal — usually
  under 24 hours — and is not a sign anything went wrong.

Also worth carrying into the keyword field: `stasher` alone is owned in
search by "Stasher Luggage Storage" and returns a full page of luggage
apps. The realistic search term is the full name, and "home inventory"
already has five established competitors.

---

## 1.0.1 — Dynamic Type fixes

1.0 shipped from commit `0a65f26` (31 July). The three text-size commits
landed 3–5 August and went only into preview builds, so the approved
binary never contained them: at large Dynamic Type settings the live 1.0
clips headings and oversizes icons.

Contents: `e69e1d6` (layout responds to text size), `5127934` (clipped
headings, giant icons, half-applied scaling), `bd56be7` (remount screens
on text-size change so headings re-measure). Binary-only — no metadata
change beyond What's New.

**Check the production build's commit before submitting.** This release
exists because that check wasn't made on the last one.

---

## 1.0.2 — Sign in with Google

Submitted for review 19 August 2026: build **7**, version **1.0.2**, from
commit `7bd131b`, uploaded with `eas submit --id`.

Contents: `5880698` (the feature), `066660b` (sends `access_token` with
the ID token, signs out of the Google SDK, revokes the grant on account
deletion), plus documentation. The Supabase side is not in this repo —
**Authorized Client IDs** and **Skip nonce check** on the Google
provider, both recorded in `backend/supabase/auth-config.md`.

Verified before submitting, on the production-signed preview build:
Google sign-up, sign-out, sign-in, and account deletion, with the
`at_hash` warning confirmed gone from `auth_logs`. An address that signed
up by emailed code and then used Google linked onto the same account and
kept its household.

Metadata changed this time, unlike 1.0.1: What's New, and a privacy
policy that now discloses Google. The policy is served from `/docs` on
`master` by GitHub Pages — it was 17 commits stale at the point the
binary was uploaded, so the URL on the listing described an app without
Google in it. **Push before submitting, not after.**

---

## v1.1 — Voice Stashing & Search (the headline follow-up)

The feature that turns the app from a form into something you talk to: "I put the passport in the hallway closet, top shelf, in the blue box" → parsed and saved. Same pipeline in reverse answers "where's the passport?" hands-free.

**Architecture:**
1. **Speech-to-text:** on-device iOS transcription via `expo-speech-recognition`. Free, no network round-trip, works in a quiet closet or over a crying baby (mostly).
2. **Parsing:** send the transcript + the household's known rooms/spots to the **Claude API** (a small fast model like Haiku is ideal). Prompt it to return JSON matching the item schema; unknown rooms/spots get flagged for one-tap confirmation rather than silently created.
3. **Key security:** the API key never ships in the app. The app calls a **Supabase Edge Function**, which holds the key and relays to the Claude API. The Phase 4 backend already gives you this plumbing.
4. **Voice search:** same Edge Function, second mode — transcript in, matching item + spoken/displayed location out.
5. **Cost:** each parse is a tiny request — realistically fractions of a cent. Verify current pricing at docs.claude.com/en/api/overview before setting the paid tier's price.

**Monetization decision — paid feature, not ads:**
- Voice is the natural **premium unlock**: it has real marginal cost (API calls), obvious wow-factor for App Store screenshots, and the free tier stays fully useful without it.
- Recommended model: free app (unlimited manual stashing, search, household sync for 2 people) + a small one-time purchase or cheap subscription ("Pro") gating voice. Subscription is more honest here since voice has ongoing per-use cost.
- **Ads: skip them.** At hobby-app scale, ad revenue is pennies a month, they'd wreck the clean bento UI, and an app whose pitch is "your household's trusted memory" shouldn't be showing banner ads next to where you keep your passport. Ads also add SDK bloat and privacy-label complications with Apple.
- Implementation: Apple in-app purchase via `expo-in-app-purchases` or RevenueCat (RevenueCat's free tier is the usual choice — it handles receipt validation so you don't have to).

## Known design debt — rooms

**Do this refactor before ever changing `DEFAULT_ROOMS`.** Not "sometime";
that specific change is what turns it from untidiness into lost data.

Today a room "exists" according to three separate sources: the
`DEFAULT_ROOMS` constant in the app, the `custom_rooms` table, and the
`hidden` flag in `room_meta`. Meanwhile `items.room` is free text the
server never validates. So a row can point at a room that renders
nowhere.

That produced three separate bugs in one evening, all the same shape: a
built-in room has no `custom_rooms` row to rename and no `room_meta` row
to hide, so `rename_room()` had nothing to act on and the client's
local-only invention was pruned back off on the next bootstrap. Renaming
a default lost the room, then its spots; deleting and re-adding one lost
the unhide and produced duplicate tiles. All fixed by pushing the
invented rows explicitly — patches on instances, not on the cause.

The hazard that remains is versioning. Rename or remove a default in a
future release and every existing household's items in that room are
orphaned at once, by an app update, with no user action to blame.
`allRooms` now includes any room an item references, so that degrades to
"an unexpected room appears" rather than "my things are gone" — but
that's a safety net, not a fix.

One more symptom, found in Phase 5 testing: creating a room and renaming
it within a second or two makes a *second* device briefly show both
names. `addRoom` goes through the outbox but `renameRoom` calls the RPC
immediately, so a fast rename can fire while the create is still in
flight — the RPC finds no row to rename, and the outbox then reconciles
with a delete plus an insert, which the receiving device sees as separate
events. The server converges correctly and the duplicate clears on the
next foreground, so it is cosmetic and self-healing; it was left alone
rather than reworking the flush/dirty-key interaction on submission day.
The refactor below removes it for free, since rename stops being an RPC.

**The fix:** seed the eight defaults into `custom_rooms` (rename it
`rooms`) when a household is created. Rooms become ordinary rows — rename
is an UPDATE, delete is a DELETE, `hidden` disappears entirely,
`room_meta` collapses to an icon column, and `DEFAULT_ROOMS` survives only
as the seed list, so changing it affects new households and never touches
existing ones. Needs a data migration for households created before it.

Deliberately not done before launch: schema churn plus a data migration
during store submission is exactly the sprawl the rule at the bottom of
this file warns about.

---

## Deferred to v1.2+ (deliberately out of scope)

- Photo attachments per item (adds Supabase Storage + camera permissions — meaningful scope)
- Push notifications ("you haven't updated the passport's location in a year")
- Container view (everything inside "the blue box")
- Android release (Play Store, $25, mostly config work since Expo builds both)

---

## Cost summary

| Item | Cost |
|---|---|
| Apple Developer Program | $99/yr |
| Supabase | Free tier (fine into thousands of users) |
| Expo EAS | Free tier (limited iOS builds/month — ran out once, see the runbook) |
| **Total to launch** | **$99** |

## The one rule

Never let a phase sprawl. If a feature idea shows up mid-phase, it goes in the v1.1 list, not the current build. The graveyard of side projects is full of apps that were 90% done for a year.
