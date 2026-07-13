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
3. [x] **Auth**: Sign in with Apple (`expo-apple-authentication`, nonce-verified) + email magic-link (PKCE flow) via Supabase auth. Root layout gates on session + household via `Stack.Protected`.
4. [x] **Household join flow**: create household → get invite code → wife enters code → same data. Screen: `app/app/household-setup.tsx`.
5. [x] Items CRUD wired to Supabase with AsyncStorage as an offline cache — a dirty-key outbox queues writes made offline and pushes them when connectivity returns (`app/lib/sync/`). One-time migration (`app/lib/migrate-legacy-data.ts`) pushes existing local Phase-3 data into the household the first time it's created.
6. [x] Supabase Realtime on `items`, `custom_rooms`, `custom_spots`, `room_meta`, with an initial fetch on join (realtime alone only streams changes from the moment of subscription, so a joining spouse needs the initial fetch to see what's already there).

**Status:** All code written and typechecked, not yet verified end-to-end on a real device — that's today's remaining work. Still open:
- [ ] Run the `replica identity full` fix for `custom_rooms`/`custom_spots` (needed for realtime delete events to carry the row's name, not just its internal id)
- [ ] Add `items`/`custom_rooms`/`custom_spots`/`room_meta` to the `supabase_realtime` publication
- [ ] Build and install the EAS development client (needed for Sign in with Apple's native entitlement — Expo Go can't do it), currently mid-way through Apple device registration
- [ ] Actually run the verification checklist end-to-end (airplane-mode offline test, two-phones-same-household realtime test) — see `docs/phase-4-plan.md` for the detailed checkpoint list per milestone

**Checkpoint:** You stash an item; it appears on your wife's phone within seconds. Sign-out/sign-in preserves data.

---

## Phase 5 — Store Readiness (1 weekend)

1. Write a **privacy policy** (required). Simple template: what you collect (email, item data), where it lives (Supabase), no selling of data. Host it anywhere public — even a GitHub Pages page.
2. Fill in App Store Connect: description, keywords, category (Productivity or Lifestyle), the **privacy nutrition label** (declare: email address, user content).
3. Take **screenshots** on the required device sizes (6.7" and 6.5" iPhone; Expo/simulator screenshots are fine).
4. Final QA pass: fresh-install flow, empty states, deleting your account (Apple requires an in-app account deletion option if you have accounts — don't skip this, it's a common rejection).
5. Bump to a release build, `eas submit`, and **submit for review**.

**Checkpoint:** Status shows "Waiting for Review."

---

## Phase 6 — Review & Launch

1. Expect 1–2 days for review. If rejected, read the note carefully — it's almost always something small (broken privacy link, missing account deletion, vague permission text). Fix, resubmit; turnaround on resubmission is usually fast.
2. Release manually (recommended) so launch happens when you choose.
3. Post-launch: watch Supabase logs and crash reports (add **Sentry** via `sentry-expo` in a point release if you want proper crash visibility).

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
| Expo EAS | Free tier (limited builds/month — sufficient) |
| **Total to launch** | **$99** |

## The one rule

Never let a phase sprawl. If a feature idea shows up mid-phase, it goes in the v1.1 list, not the current build. The graveyard of side projects is full of apps that were 90% done for a year.
