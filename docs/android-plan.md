# Android Launch — Plan

Last updated 30 August 2026.

**Where things stand: the app is ready. The paperwork is not.**

Nothing in the code is blocking an Android release. What's left is a Play
Console account, twelve testers, a fortnight of waiting, and a store
listing. None of it is programming.

---

## Done

| | |
|---|---|
| ✅ **Google Sign-In** | Shipped in 1.0.2. Works on iOS; the Android path (`hasPlayServices`) is written and waiting on credentials only. |
| ✅ **`android.package`** | `com.tb.wheredidiputit`, matching iOS. |
| ✅ **App icons** | All three adaptive layers regenerated from the real mark by `scripts/android-icons.js`. They were Expo's default chevron. |
| ✅ **`edgeToEdgeEnabled` removed** | Deprecated in SDK 54, gone in SDK 55, and unusable on API 36 anyway. |
| ✅ **Android 16 / API 36** | SDK 54 targets it by default. The 31 August 2026 deadline needs no action. |
| ✅ **Back button** | Every sheet is a `Modal` with `onRequestClose`; the tutorial uses `BackHandler`. Already correct. |
| ✅ **Backend** | Nothing to do. Supabase, RLS, sync and invites are platform-agnostic. An Android user joins an iPhone household with the same code. |

---

## Your turn — do these now, in this order

### 1. Register the Play Console account · $25
**https://play.google.com/console/signup** — choose a **personal** account.

Identity verification (government ID) can take **several days** and blocks
everything downstream. This is the only thing setting your launch date.
Don't create the app listing yet — just get approved.

### 2. Line up 16 testers
You need **12 people installed continuously for 14 days** before you may
even *apply* for production. Recruit 16; some will install nothing.

Ask each for **the Gmail address on their Google Play account**. Nothing
else works. Collect the list now — they've nothing to do yet.

This is the most likely thing to stall the launch, and no amount of code
fixes it.

### 3. Install Android Studio
**https://developer.android.com/studio** — defaults are fine.

Then Device Manager → add a Pixel → pick a system image **with the Play
Store icon**. Not "Google APIs", not AOSP, or Google Sign-In can't run in
it.

Big download, so start it early. It gets you the emulator (needed for
screenshots regardless) and `npx expo run:android`, which builds locally
and **uses no EAS quota**.

### 4. Create the Android OAuth client
**https://console.cloud.google.com/apis/credentials** — same project as
your iOS and Web clients → Create credentials → OAuth client ID →
**Android**.

- Package name: `com.tb.wheredidiputit`
- SHA-1: run `eas credentials --platform android`, pick production →
  Keystore → show credentials, copy the fingerprint. **Costs no build
  quota.**

Send me the client ID and I'll record it in `auth-config.md`. It lives in
no file and no env var, so it's easy to lose.

---

## Then — needs EAS build quota

5. `eas build --profile production --platform android`
6. Create the app in Play Console, then `eas submit --platform android`
7. **Register the second SHA-1** ⚠️ see the warning below
8. Push to a closed testing track, 12+ testers opted in — **the 14-day
   clock starts here**

---

## Then — while the 14 days run

These need no build and can be done any time. I can do most of them:

- Feature graphic, 1024×500, no transparency (new — no iOS equivalent)
- App icon for the listing, 512×512 PNG (just `icon.png` resized)
- Short description, 80 chars, and full description, 4000
- `docs/delete-account.md` on GitHub Pages — **Play requires account
  deletion be reachable from the web**, not just in-app. Apple didn't.
- Emulator screenshots
- Data safety form, content rating (IARC), target audience: **not
  children**
- QA pass on the emulator: text scaling, Display Size, keyboard, dark mode

Then apply for production access, fix what testers found, and promote.

---

## Three things that can actually hurt you

**⚠️ The SHA-1 that matters doesn't exist yet.** Google re-signs everything
distributed through Play with its own key. The EAS keystore fingerprint
from step 4 only covers builds you install directly. After your first
upload, go to Play Console → Test and release → Setup → **App integrity**,
copy that SHA-1, and add it to the same Android OAuth client.

Skip this and Google Sign-In works perfectly for you and fails for all
twelve testers at once, with an error code that explains nothing. It is
the single most common way this integration ships broken.

**⚠️ The package name locks forever at first upload.** `com.tb.wheredidiputit`
can't be renamed or corrected afterwards — a typo means a new listing and
a lost URL. It's still free to change today. Read it once more before
step 5.

**⚠️ Twelve testers is the real bottleneck.** Start asking now, not when
the build is ready.

---

## One thing to watch, not fix

`predictiveBackGestureEnabled` is `false` in `app.json`, which is still a
supported Expo setting. But Android's own default flips for apps targeting
API 36, and the opt-out may simply be ignored there. Your back handling is
correct either way — this is a "check it on the emulator" item, not a code
change.

Also untested, and only testable on a device: Android's **Display Size**
setting, which changes density separately from font scale. The text-scaling
work was tested against iOS Dynamic Type only.

---

## Cost

$25 once, forever — no annual renewal, unlike Apple's $99. Supabase and
EAS unchanged.
