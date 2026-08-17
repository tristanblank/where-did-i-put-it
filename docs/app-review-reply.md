# Guideline 2.1 — Information Needed: the reply

Rejected on the first submission of 1.0 with the standard "Information
Needed" template: seven questions, plus a screen recording. This is not a
code rejection — no new build is required, and resubmitting one would
waste a cycle. The reply goes in the **Resolution Center**, and the same
text belongs in **App Review Information → Notes** so the next submission
never asks again.

The notes drafted in `app-store-listing.md` answer roughly item 4 alone.
The template asks for six other things, and a partial answer reads as a
non-answer.

---

## 1. The screen recording

Apple's constraints, all of which are checkable and all of which get the
reply bounced if missed:

- **A physical device**, not the simulator. A simulator recording has no
  Sign in with Apple sheet, which is most of what they want to see.
- **The latest OS.** Update the phone first.
- **Starts with the app launching** — from the home screen, tapping the
  icon. Not from an app already open.
- Shows the **typical user flow through the core features**.

Record with the iOS built-in screen recorder (Control Centre), then
upload the file directly in the Resolution Center reply. Don't link to
YouTube or Drive — reviewers frequently can't or won't follow external
links, and a private link is a second rejection.

### Shot list

Roughly three minutes. Go slowly: pause a beat on each screen so the
reviewer sees where a tap landed, and don't skip the boring parts — the
things they're checking for are exactly the parts that feel obvious.

1. **Launch** from the iOS home screen, cold. Show the splash and the
   sign-in screen.
2. **Sign in with Apple** — the full system sheet, including the
   Hide My Email choice, through to landing in the app.
3. **Create a household**, then the home screen with rooms.
4. **Stash an item**: room → spot → container → name. Show it appear.
5. **Search** for it from the home screen.
6. **Open the item**, edit it, show "Added by <name>".
7. **Add a room** and rename one — the customisation the description
   claims.
8. **The 👥 sheet**: invite code, Share, rotate the code, display name.
9. **Second account** (this is the one that's easy to skip): sign out,
   sign in with the **email code** flow on a different address, enter
   the invite code, and show the same items appear. If a second device
   is available, film both side by side instead — that shows live sync,
   which is the entire point of the app.
10. **Account deletion**: 👥 → Delete account → confirm → back at the
    sign-in screen. Then sign in again to show the account is gone.

On their four bullets: registration/login/deletion are steps 2, 9 and 10.
There is **no** paid content, no purchase or subscription flow, and no
permission prompt of any kind — no location, contacts, camera, or ATT.
Say so explicitly in the reply rather than leaving the reviewer to infer
it from absence.

---

## 2–7. The written answers

Paste verbatim into the Resolution Center, and into App Review
Information → Notes for the next submission.

**The Notes field caps at 4000 characters.** This block is ~3,500 with
the placeholders in, which leaves little room to add to it — anything
longer has to be cut somewhere, not appended. The Resolution Center
reply has no such limit, so extra detail can go there if a reviewer asks
a follow-up.

```
2. DEVICES AND OS VERSIONS TESTED

<<FILL IN: model>> running iOS <<FILL IN>>, on a production-signed
TestFlight build. Covered: Apple and email sign-in, household creation,
joining by invite code, offline use, sync between two accounts, and
account deletion.

3. WHAT THE APP DOES AND WHO IT IS FOR

Stasher is a shared household inventory. People write down where they
put something — "hallway closet, top shelf, blue box" — and can find it
again later, as can everyone else they live with. In a shared home the
person who put something away is often not the person looking for it.

The audience is households: families, couples, flatshares. Users
organise items by room, add their own rooms, search across everything,
and share the list with their household through a single invite code.
The app works offline and syncs when a connection returns.

There is no paid tier, in-app purchase, subscription, or advertising.
The app is free and complete as submitted.

4. HOW TO SET UP AND REACH EVERY FEATURE

No demo account is needed, and "Sign-in required" is unchecked because
the app has no passwords.

Sign in any of three ways:
- Sign in with Apple, using any Apple ID,
- Sign in with Google, using any Google account, or
- the email option: enter any address and we email an 8-digit code.
  There is no password and no link to click.

Then:
- Create a household when prompted.
- Tap + to stash an item: choose a room, a spot within it, optionally a
  container, and name the item.
- Search from the field at the top of the home screen.
- Tap a room to see its contents; tap an item to edit or delete it.

Household sharing is the app's main feature and is invisible to a
single account:
- Tap the people button on the home screen. It shows an invite code.
- Sign in as a second account (a second email address is enough) and
  enter that code on the "Join with a code" screen.
- Both accounts now see the same items, syncing live.

Account deletion: people button -> "Delete account". This deletes the
account and its data, and signs the device out.

5. EXTERNAL SERVICES

- Supabase (supabase.com) — hosted Postgres and authentication. Stores
  accounts, households and items, and delivers live sync. Row-level
  security in the database restricts each household's items to its own
  members.
- Sign in with Apple — authentication only.
- Sign in with Google — authentication only. We receive the account's
  email address and name, and nothing else; no Google service beyond
  sign-in is used and no Google data is read.
- Expo Application Services — build tooling, not contacted at runtime.

No payment processor, no AI service, no advertising or attribution SDK,
no analytics, no crash reporter. The app makes no network requests to
anything other than Supabase and the Apple and Google sign-in services.

6. REGIONAL DIFFERENCES

None. Identical features and content in every region: no geographic
gating, no region-specific pricing (free everywhere), no location
detection. English only at this version.

7. REGULATED INDUSTRY OR THIRD-PARTY MATERIAL

Neither applies. No health, finance, gambling, dating or medical
functionality, and no third-party or licensed material — all content is
written by us or typed by the user about their own possessions.

USER-GENERATED CONTENT

Users type item names and notes about their own belongings. This is
never public and never visible to strangers: it is readable only by
members of one household, joined by entering a code an existing member
chose to share. There is no feed, no discovery, no profiles, no
cross-household search, and no way for one user to send anything to
another. Any member can leave a household, and any member can rotate
the invite code, which invalidates the old one immediately.
```

The trailing UGC paragraph isn't in their numbered list, but their first
item asks about "user-generated content, including content reporting and
blocking mechanisms". Item content here is user-typed, so "no UGC" would
be false; the answer that fits is that there's no public surface and no
stranger contact, which is why there is nothing to report or block in
the sense guideline 1.2 describes. Leaving it out invites the question
as a second rejection.

It is the same reasoning as the age-rating answer in
`app-store-listing.md`, and the two need to stay consistent — a reviewer
comparing them is exactly the scenario this doc exists for.

### If it needs to be shorter still

In rough order of what costs least to lose:

1. The second paragraph of item 3 (rooms, search, offline) — item 4
   demonstrates all of it.
2. The Expo line in item 5. It is build tooling, not a runtime
   dependency, and nothing in the app contacts it.
3. Item 7 down to one sentence: "Neither applies."

Don't cut items 4 or 5, or the UGC paragraph. Those are the three the
reviewer actually needs, and the first two are what a 2.1 is usually
about.

---

## Before replying

- [ ] Fill in the device model and iOS version in item 2.
- [ ] Record the video on that device, on the current iOS.
- [ ] Watch it back start to finish. A recording that misses the launch,
      or that quietly skips the second account, gets the same rejection
      again with a week gone.
- [ ] Paste the block into App Review Information → Notes as well as the
      Resolution Center reply, and check the character count survived
      any edits.
- [ ] Confirm "Sign-in required" stays unchecked.
