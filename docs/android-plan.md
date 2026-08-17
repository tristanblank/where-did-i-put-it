# Android Launch — Plan

**Status: not started.** Listed in `ship-plan.md` as v1.2+, "mostly config
work since Expo builds both." That's half right. The build is config work.
The *launch* is a 14-day waiting period, a sign-in method that doesn't
exist yet, and a store listing with assets nobody has made.

Decisions already taken:

| Decision | Choice | Consequence |
|---|---|---|
| Play Console account | New personal | Subject to the 12-testers / 14-day gate |
| Android sign-in | Add Google Sign-In | New dependency, new credentials, a real trap |
| Test hardware | Emulator only | No real-device QA until the closed test |

---

## Nothing here touches the backend

Worth saying up front, because it bounds the work. Supabase, the schema,
RLS, the RPCs, realtime, and the offline outbox are all platform-agnostic
and already shipped. An Android user will join an iPhone household with
the same invite code and sync against the same tables. No migration, no
second project, no new environment.

This is a client port plus a store submission. The hard parts are Google's
process, not the app.

---

## The clock that sets the schedule

Personal Play Console accounts created after 13 November 2023 must run a
**closed test with at least 12 testers, opted in continuously for 14
days**, before they can even apply for production access.

Read "continuously" literally. A tester who opts in, tests, and opts out
early doesn't count. If someone drops and rejoins, their 14 days restart.
Twelve is a floor, not a target — recruit fifteen or sixteen, because some
will install nothing and one will remove the app the day before you apply.

Two consequences that should drive the whole sequence:

**Start the clock before the app is finished.** The 14 days are wall
clock, not work. Every day spent polishing before the first closed-track
upload is a day added to the launch date for free. Get a working build —
not a perfect one — onto a closed track as early as it is honest to do so.

**Twelve testers is a social problem, not a technical one.** It is the
part of this plan most likely to stall, and it's the only part that can't
be solved at the keyboard. Line the people up before you need them.

There is a silver lining, and it's a real one. You have no Android device,
which after the Phase 5 experience — nine bugs, seven of which would have
shipped silently, every one of them invisible to `tsc` and `expo lint` —
should be the thing that worries you most. Twelve testers on twelve real
handsets is better device coverage than the iPhone launch ever had. The
gate is also the QA you're missing. Treat it that way: ship a build you
want feedback on, and ask for it.

## The other clock

**From 31 August 2026, new apps must target Android 16 (API 36).** That's
about two weeks out, and the 14-day gate means you cannot reach production
before it lands regardless. So target 36 from the first build and don't
think about it again. An extension to 1 November is available but pointless
here.

Expo SDK 54 supports API 36. What it *defaults* to is worth confirming
rather than assuming — check the generated `build.gradle` after a build,
and if it comes out below 36, pin it:

```json
["expo-build-properties", {
  "android": { "compileSdkVersion": 36, "targetSdkVersion": 36, "buildToolsVersion": "36.0.0" }
}]
```

Note this interacts with the back-gesture question below: targeting 36 is
what makes predictive back the default.

---

## What's actually missing

Concrete gaps, found by reading the repo rather than guessing.

### 1. `android.package` is not set — the build will fail

`app.json` has an `android` block with icons and `edgeToEdgeEnabled`, but
no `package`. It's required. Set it to match iOS:

```json
"android": { "package": "com.tb.wheredidiputit", ... }
```

**This is a one-way door.** The applicationId can never change after the
first upload to Play — not renamed, not corrected. Getting a typo here
means a new listing and a lost URL. Set it deliberately, once.

`versionCode` needs no attention: `eas.json` already uses
`appVersionSource: "remote"` with `autoIncrement: true` on production,
which covers Android as it does iOS.

### 2. The Android icon is still the Expo template

`assets/images/icon.png` is the real Stasher mark — the crates and the
house pin on cobalt. `assets/images/android-icon-foreground.png` is
**Expo's default blue chevron**, untouched since the scaffold, and
`app.json` points the adaptive icon at it. Ship as-is and the app has
someone else's logo on the home screen.

Three files to regenerate from the existing mark:

- `android-icon-foreground.png` — 512×512, and the mark must sit inside
  the safe zone. Android masks adaptive icons to circles, squircles and
  rounded squares depending on launcher, and clips roughly the outer
  quarter. The iOS icon is a full-bleed square; cropping it to 512 will
  cut the crates.
- `android-icon-background.png` — 512×512, the cobalt field.
  `app.json` currently sets *both* a `backgroundColor` (`#E6F4FE`, a pale
  blue that isn't the brand colour) and a `backgroundImage`. The image
  wins, so the stray colour is harmless but misleading — fix it while
  you're there.
- `android-icon-monochrome.png` — 432×432, single-colour silhouette, used
  by themed icons on Android 13+.

Also needed for the listing: a **512×512 32-bit PNG** app icon, separate
from anything in the app bundle.

### 3. Account deletion needs a *web* page

Play's User Data policy requires that an app offering account creation
also lets users request deletion **from outside the app** — a web page,
linked in the Data safety form, reachable by someone who has already
uninstalled. In-app deletion alone satisfied Apple. It does not satisfy
Google.

Cheap to fix: `docs/privacy-policy.md` and `docs/support.md` are already
served by GitHub Pages, so add `docs/delete-account.md` alongside them.
It needs to state what deletion removes, what the in-app path is (👥 →
Delete account), and give an email address for people who can't get into
the app. That last case is real — a household member who changed email
addresses can't reach the button.

### 4. Google Sign-In, and the trap inside it

The plan is `@react-native-google-signin/google-signin` with Supabase's
`signInWithIdToken`, which is the same shape as the existing Apple flow in
`auth-store.tsx`. It needs a development build, which you already use.

The credentials are where this goes wrong:

- A **Web client ID** — what Supabase and the library are configured with.
- An **Android client ID** — bound to the package name *and* a SHA-1
  certificate fingerprint.

And here is the trap. **You need at least two SHA-1s registered, and the
one that matters in production is not the one you build with.** Play App
Signing re-signs every artifact with a key Google holds. Your EAS upload
keystore signs the upload; Google's app signing key signs what users
install.

- EAS keystore SHA-1 — from `eas credentials --platform android`. Covers
  builds you install directly.
- **Play app signing certificate SHA-1** — Play Console → Test and release
  → Setup → App integrity. Covers everything distributed through Play,
  including the closed test.

Register both in Google Cloud Console. Miss the second and Google
Sign-In works perfectly for you and fails for all twelve testers, with a
developer-error code that says nothing useful. This is the single most
common way this integration ships broken.

One more: Supabase validates a nonce by default, and the standard
`google-signin` flow doesn't hand you the raw nonce to match it against.
Either mirror the hashed-nonce approach the Apple path already uses, or
turn on **Skip Nonce Check** under Authentication → Providers → Google.
Whichever you pick, write it into `backend/supabase/auth-config.md` — that
file exists precisely because dashboard settings aren't reproducible from
this repo, and this is another of them.

**Keep the Google button off iOS.** Apple's 4.8 allows it as long as Sign
in with Apple stays available, and it would, so this is scope discipline
rather than compliance: one new auth path on one new platform is enough
for one release. `sign-in.tsx` already gates the Apple button on
`isAvailableAsync()`, so it hides itself on Android with no change.

### 5. Store listing assets that don't exist

Play's requirements differ from Apple's more than you'd expect:

| Asset | Requirement | Status |
|---|---|---|
| Feature graphic | 1024×500, JPEG or 24-bit PNG, **no alpha** | Doesn't exist |
| App icon | 512×512 32-bit PNG | Doesn't exist |
| Phone screenshots | 2 minimum, 8 max, 320–3840px per side | Emulator can produce |
| Short description | 80 characters | Doesn't exist |
| Full description | 4000 characters | Adapt from the listing doc |

The **feature graphic** is the genuinely new one — a banner with no iOS
equivalent, shown across store surfaces, and Google crops it freely, so
nothing important goes near the edges.

The 80-character short description is also new and is not the App Store
subtitle (30 chars). "Stash Your Stuff" is too thin for a field with 80.

Screenshots come from the emulator, which is a straight improvement over
the iPhone situation — no physical device, no Windows limitation. Take
them at a common phone resolution (1080×1920 or 1080×2400); both are
inside Play's bounds, so `scripts/store-screenshots.js` needs no Android
preset unless you want one. Do use the emulator's **Google Play** system
image rather than a plain AOSP one, or Google Sign-In won't work in it.

### 6. The forms

- **Data safety** — Play's nutrition label. Same four data types as the
  App Store answers in `app-store-listing.md` (email, name, item content,
  user ID), but Play asks two things Apple doesn't: whether data is
  encrypted in transit (yes) and whether users can request deletion (yes,
  once §3 exists). Keep it consistent with the iOS answers; they're
  public and comparable.
- **Content rating** — the IARC questionnaire. Free, a few minutes,
  produces ratings for every region at once.
- **Ads declaration** — none.
- **Target audience** — not children. Declaring otherwise pulls in
  Families policy, which you do not want.

---

## Android behaviour the iOS build never exercised

The code is already more Android-aware than you'd expect — `tile-style.ts`
has an `elevation` branch beside the iOS shadow, and every
`KeyboardAvoidingView` passes `undefined` on Android. That's a good
starting position, not a finished one.

**The back gesture, and this one needs a decision.** `app.json` sets
`predictiveBackGestureEnabled: false`, but targeting API 36 changes the
ground: predictive back animations are on by default, `onBackPressed` is
no longer called, and `KEYCODE_BACK` is no longer dispatched. The three
bottom sheets (`household-sheet`, `room-actions-sheet`, `add-room-sheet`)
and the add-item flow all assume a close button. A user pressing back
expects the sheet to close, not the app to quit. Test it early; it is the
most likely source of an Android-only bug that looks like data loss.

**Text scaling, on a second axis.** The recent work — `use-large-text`,
the remount-on-fontScale-change commits — was tested against iOS Dynamic
Type. Android has font scale *and* a separate Display Size setting that
changes density. Both need the maximum-setting pass that
`ipad-plan.md` recommended, and the second one is the untested axis.

**Keyboard behaviour.** Android relies on `adjustResize` rather than
`KeyboardAvoidingView`. The iOS QA pass found the rename input sitting
behind the keyboard with its Save button; that class of bug is
per-platform and it's worth re-walking the same flows.

**Everything else:** back-navigation out of a room, the deep-link scheme
(`stasher://`, currently unused since email sends codes not links),
`expo-secure-store` on Android Keystore, dark theme with the system
toggle, and edge-to-edge — already enabled, and mandatory on Android 16.

---

## Sequence

### Phase A — start the clock (first, and fast)

1. Register the Play Console account, $25. Identity verification can take
   days; it blocks everything, so do it before writing any code.
2. Set `android.package` in `app.json`. One-way door — check it twice.
3. Regenerate the three adaptive-icon files from the real mark.
4. Implement Google Sign-In, with **both** SHA-1s registered.
5. `eas build --profile production --platform android`. Confirm the
   emitted `targetSdkVersion` is 36.
6. Create the app in Play Console, then `eas submit --platform android`.
   The first upload does *not* have to be manual — `eas submit` creates
   the first release itself, given a Google service account key
   (`eas credentials --platform android`).
7. Closed testing track, 12+ testers opted in. **The clock starts here.**

### Phase B — while the 14 days run

8. Feature graphic, 512×512 icon, emulator screenshots.
9. Short and full descriptions.
10. `docs/delete-account.md`, published to GitHub Pages.
11. Data safety form, content rating, target audience.
12. The Android QA pass — back gesture, text scaling, keyboard, dark mode.
13. Collect tester feedback. Not ceremony: production access asks what
    you learned from the test, and this is your only real-device signal.

### Phase C — production

14. Apply for production access on the Play Console dashboard.
15. Fix what the testers found; ship it to the closed track first.
16. Promote to production. Google's review is typically faster than
    Apple's, though a first release from a new account runs longer.

Phases A and B genuinely overlap. That's the point of the ordering —
nothing in B is blocked by anything in B, and all of it is blocked by
finishing A.

---

## Cost

$25, one time, forever — no annual renewal, unlike Apple's $99. Supabase
and EAS are unchanged. The cost summary in `ship-plan.md` can gain a row.

---

## Risks, ranked

1. **Twelve testers don't materialise.** No technical fix. Over-recruit,
   and start asking now rather than when the build is ready.
2. **Google Sign-In breaks in production only.** The Play app signing
   SHA-1. Verify from a Play-distributed build, not a local one — that is
   the *only* build that proves it, exactly as release-signed Sign in with
   Apple was on iOS.
3. **An Android-only bug ships to twelve people at once.** Mitigated by
   the closed track being closed. Ship the QA pass before the testers
   arrive, not after.
4. **The `android.package` typo.** Unfixable after upload.
5. **Rooms design debt.** Unchanged by this work, but every new household
   is another one to migrate when `DEFAULT_ROOMS` is finally refactored.
   Android grows that number. It doesn't change the plan; it does mean the
   refactor in `ship-plan.md` gets no cheaper by waiting.

## Related

`ipad-plan.md` notes that the responsive-layout work serves both, and it
still does. But Android phones are phones — the existing percentage-based
layout stretches across handset widths without a redesign. Android does
not need the iPad work, and shouldn't wait for it.
