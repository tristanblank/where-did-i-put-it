# Phase 5 — QA Checklist

Run this against a **preview build**, not the dev client. The dev client
gets its JavaScript from Metro on the dev machine; a preview build has it
bundled in, which is what actually ships. Testing the wrong one proves
nothing about the artifact.

Both apps can sit on the phone at once and look nearly identical. Delete
the dev client first, or be deliberate about which icon you tap.

> **One-device constraint.** The provisioning profile currently registers
> a single iPhone, and `preview` uses internal (ad-hoc) distribution, so
> the build installs on that phone only. Tests marked **[2-device]** can't
> be done as written. Two ways round it: register the second device's UDID
> and rebuild, or have someone drive the second side from the Supabase SQL
> editor — for anything that's really "did this device notice a change it
> didn't make", a direct database change is a faithful stand-in for
> another phone, and is *more* faithful for the offline cases because it
> can happen while the phone is fully closed.

---

## A. First launch — the path no one has walked since auth landed

- [ ] **A1** Install the preview build. It launches to the sign-in screen
      without crashing.
      *This is the whole point of the preview build: it's the first time
      the app runs with JS bundled by EAS rather than served by Metro. A
      crash here means the `EXPO_PUBLIC_*` environment variables aren't
      reaching the bundle.*
- [ ] **A2** Sign in with Apple. Lands in the existing household with all
      12 items showing.
- [ ] **A3** Force-quit, reopen. Still signed in, no sign-in screen.
      *Proves the session survives in the Keychain — this build is the
      first with `expo-secure-store` doing the storing rather than
      AsyncStorage.*
- [ ] **A4** Sign in with the email code path instead (second account, or
      after signing out). The emailed 6-digit code works.
      *Password sign-in was deliberately removed from that account, so if
      this fails, check that OTP and not password auth is being used.*

## B. Never run on a device

These three are the reason for this pass. Each passed in SQL only, and
this session produced two bugs that passed exactly that bar.

- [ ] **B1 — Deletion pruning.** With the app **fully closed** (not
      backgrounded), have an item deleted server-side. Reopen the app. The
      item is gone.
      *The bug this fixes: realtime only delivers while connected, and
      `bootstrap()` used to only add and update, never remove. Anything
      deleted while the app was closed stayed forever.*
- [ ] **B2 — Offline work survives pruning.** Turn on airplane mode, add
      an item, force-quit, reopen (still offline). The new item is **still
      there**. Then reconnect and confirm it syncs.
      *This is the dangerous half of B1. Pruning exempts dirty keys; if
      that's wrong, the fix deletes the user's own unsynced work.*
- [ ] **B3 — Leave and rejoin.** Note the invite code first. Leave the
      household. Items disappear, and the setup screen appears. Rejoin
      with the code. All 12 items come back.
      *Leaving as the last member stamps `abandoned_at` rather than
      deleting, precisely so this is recoverable. If the items don't come
      back, stop and check the database before doing anything else — the
      rows should still be there.*
- [ ] **B4 — Account deletion.** Apple tests this directly under
      guideline 5.1.1(v), so it must work and must be findable.
      Household screen (👥) → "Delete account". Confirm you're signed out
      immediately and the account is gone.
      *Do this **last**, and ideally on the second account rather than the
      one holding the real household. If you're the only member, the
      household and every item in it is deleted too — that's intended, and
      unlike leaving it is not recoverable.*

## C. Changed this session — regression checks

- [ ] **C1** Add an item. Open it. It says **"Added by you"**
      *immediately*, without backgrounding the app.
      *The first version only populated this on the next foreground.*
- [ ] **C2** Set your name in the household sheet. Reopen the sheet — it
      persisted.
- [ ] **C3** **[2-device]** The other member sees your name against items
      you added, rather than "Unnamed member".
- [ ] **C4** Rotate the invite code. The displayed code changes, and the
      old one no longer works when someone tries to join with it.
      *Rotation invalidates the code but removes nobody — anyone already
      in the household stays in.*
- [ ] **C5** Sign out, then sign in as a **different** account. None of
      the first account's items are visible.
      *Sign-out clears the local cache. Before that fix, the next account
      on the phone saw the previous one's items and could push them into
      its own household by editing one.*
- [ ] **C6** Rename a room with items in it. Every item follows the new
      name, and the room's icon and hidden state come with it.
- [ ] **C7** Edit an item that someone else added. The "Added by" still
      credits **them**, not you.
      *`created_by` is a server-side default and deliberately not sent on
      update, so an edit can't rewrite attribution.*

## D. Fresh-install and empty states

Apple reviewers see an empty app, which is a state real usage stops
showing you.

- [ ] **D1** A brand-new account reaches the household setup screen and
      can both create a household and join one by code.
- [ ] **D2** A household with zero items: the home screen reads sensibly
      rather than looking broken.
- [ ] **D3** A room with zero items (Bathroom and Office are both empty
      now) — the room screen has a sensible empty state.
- [ ] **D4** Search with no matches, and search before anything is
      stashed.
- [ ] **D5** An invalid invite code shows a helpful error, not a crash or
      a silent no-op.

## E. Offline and sync

- [ ] **E1** Airplane mode: add, edit, and delete items. Every change
      appears instantly in the UI.
- [ ] **E2** Reconnect. All of it reaches the server within seconds.
- [ ] **E3** **[2-device]** Both phones open: stash on one, it appears on
      the other in a second or two.
- [ ] **E4** Background one phone, change something on the other, then
      foreground the first. It catches up.
      *Realtime doesn't replay missed events — this is the foreground
      refetch doing its job, and it's the same mechanism B1 depends on.*

## F. Store-submission requirements

- [ ] **F1** Privacy policy URL loads in a browser, from a device that
      isn't the dev machine.
      *A dead privacy link is one of the most common rejections.*
- [ ] **F2** Support URL loads. Apple requires one separately from the
      privacy policy.
- [ ] **F3** Account deletion is reachable in at most a couple of taps
      from the main screen (5.1.1(v)).
- [ ] **F4** Sign in with Apple works in the release build specifically —
      release signing differs from development.
- [ ] **F5** No placeholder text, lorem ipsum, or debug UI anywhere.
- [ ] **F6** Screenshots match what the app actually does now, and none
      of them shows a live invite code.

---

## If something fails

Anything in **B** is a stop-and-fix, not a ship-with-a-note: B1 and B2
are silent data problems, B3 can make a household look empty, and B4 is a
guaranteed rejection.

Failures in **C** through **E** are worth judging individually. Most are
polish; C5 and C7 are the two with real consequences (cross-account data
visibility, and misattributing someone else's work).
