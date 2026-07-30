# Phase 5 — QA Checklist

**Status: 25 of 29 passed.** Four remain, three of which unblock
themselves once the production build exists.

Run against a **preview build**, not the dev client — the dev client gets
its JavaScript from Metro, a preview build has it bundled, and only the
second is what ships. Both share the bundle id `com.tb.wheredidiputit`,
so installing one *replaces* the other; there is never a choice of two
icons.

> **One-device constraint.** The provisioning profile registers a single
> iPhone and `preview` uses internal (ad-hoc) distribution, so builds
> install on that phone only. Tests marked **[2-device]** were done by
> driving the second side from the Supabase SQL editor instead — which is
> a faithful stand-in, and *better* for the offline cases, since a
> database change can happen while the phone is fully closed.

---

## A. First launch

- [x] **A1** Preview build launches without crashing.
      *The point of the exercise: first run with JS bundled by EAS rather
      than served by Metro. Would have crashed outright if the
      `EXPO_PUBLIC_*` variables weren't reaching the bundle — they
      weren't, until they were registered as EAS environment variables.*
- [x] **A2** Household and all items present.
- [x] **A3** Session survives a force-quit.
      *Stronger than planned: it survived the app being wholly replaced by
      a new build, which also proved the AsyncStorage → Keychain migration
      works without logging anyone out.*
- [x] **A4** Email one-time code signs in.
      *Took three attempts and two fixes — see the auth entries below.*

## B. Never run on a device before this pass

- [x] **B1** Deletion pruning — items deleted while the app was closed
      disappear on reopen.
      *Verified against a genuinely stale cache: 11 demo items deleted via
      SQL the previous day were still on the phone. Bootstrap only ever
      added and updated, never removed, so anything deleted while the app
      was shut stayed forever.*
- [x] **B2** Offline work survives pruning.
      *Passed, but exercised the **failed-fetch guard** rather than the
      dirty-key exemption: offline, the bootstrap fetch itself fails, so
      pruning never runs. That's the more dangerous guard — without it a
      flaky connection reads as "server has nothing" and wipes the cache.
      The dirty-key exemption is sound by construction in either
      flush/prune ordering, but was never actually hit.*
- [x] **B3** Leave and rejoin restores everything.
      *The **last-member branch was not exercised** — the other member was
      still in the household, so `abandoned_at` was never stamped. That
      path is proven in SQL only. Client code is identical either way, so
      the untested part is entirely server-side, where it was tested.*
- [x] **B4** Account deletion works and signs you out.
      *Done on a throwaway account, which also cleaned itself up: deleting
      the last member removed its household too.*

## C. Changed during this pass

- [x] **C1** "Added by you" appears immediately on a new item.
      *Failed first: `created_by` was assigned server-side, and the outbox
      drops the realtime echo of its own write, so the value only landed
      on the next foreground. Now set locally at creation.*
- [x] **C2** Display name persists.
- [x] **C3** Another member's name renders against their items.
      *[2-device] — verified by inserting an item as the other member via
      SQL, so it exercised the same resolution path without her phone.*
- [x] **C4** Invite-code rotation.
      *Old code rejected, new code accepted, both members retained. The
      apparent failure was a stale Supabase Table Editor view, not a stale
      database.*
- [x] **C5** Signing in as a different account shows none of the previous
      account's items.
- [x] **C6** Renaming a room.
      *Found three separate bugs. See below — this was the most productive
      item on the list.*
- [x] **C7** Editing someone else's item preserves their authorship.

## D. Fresh install and empty states

- [x] **D1** New account can create and join a household.
- [x] **D2** Empty household reads sensibly.
- [x] **D3** Empty room has a sensible empty state.
- [x] **D4** Search with no matches, and before anything is stashed.
- [x] **D5** Invalid invite code shows a helpful error.

## E. Offline and sync

- [x] **E1** Offline add / edit / delete apply instantly.
- [x] **E2** Everything reaches the server on reconnect, with correct
      attribution and a server-clock `updated_at`.
- [ ] **E3** **[2-device]** Live realtime between two phones.
      **Blocked** — the second device isn't provisioned. Unblocks via
      TestFlight once a production build is submitted (internal testers
      need no review).
- [x] **E4** Background one side, change data, foreground it — catches up.
      *Tested across three tables at once (`items` insert, `items` update,
      `room_meta` insert); all four visible changes appeared.*

## F. Store-submission requirements

- [x] **F1** Privacy policy URL loads.
- [x] **F2** Support URL loads.
- [x] **F3** Account deletion reachable in a couple of taps (5.1.1(v)).
- [ ] **F4** Sign in with Apple on a **release**-signed build.
      Can only be done once the production build exists. Do it via
      TestFlight *before* submitting for review, not after.
- [ ] **F5** No placeholder text, lorem ipsum, or debug UI. Quick visual
      pass, not yet done.
- [ ] **F6** Screenshots match the app. **Knowingly stale** — they
      predate the "Add a room" tile, and were shot with temporary demo
      items that have since been deleted. Accepted: Apple doesn't compare
      screenshots against the running app, and reshooting now would trade
      "missing a tile" for "looks emptier".

---

## What this pass actually found

Nine bugs, seven of which would have shipped silently. Recorded because
the pattern is more useful than the list: **every one of them passed
`tsc` and `expo lint`, and several passed SQL verification too.** Only
running the thing on a phone surfaced them.

| Bug | Fix |
|---|---|
| Production build had no `EXPO_PUBLIC_*` variables — would have crashed on launch and been rejected under 2.1 | EAS environment variables for `production` and `preview` |
| Deletions were never reconciled; anything deleted while the app was closed stayed on that device forever | `3aa4419` |
| `created_by` only populated on the next foreground | `e7e71f8` |
| Renaming a built-in room lost the room entirely | `80a1e61` |
| Rename input sat behind the keyboard, with the Save button | `80a1e61` |
| Renaming a built-in room lost all of its spots | `90a832d` |
| Deleting a default room then re-adding it lost the unhide, and rendered two tiles with the same name | `90a832d` |
| Sign-in flashed "Create a household" at someone who had one | `ce38059` |
| Client ran the implicit flow while the deep-link handler read PKCE, so emailed links silently died — *and spent the one-time token, breaking the code fallback too* | `d47e3df` |
| No way to add a room without starting to stash an item | `e5ae909` |
| A room with items could render nowhere and its items vanish from the app | mitigated in `e5ae909` |

Two more were configuration rather than code: Supabase's Site URL was
still `http://localhost:3000`, so every email link went nowhere; and the
email templates now carry only the code, no link — which removes the
whole fragile path and, incidentally, makes cross-device sign-in work.

## Remaining sequence

1. **Nutrition label** in App Store Connect — see `app-store-listing.md`
2. **F5** — visual pass
3. **Production build** → `eas submit`
4. **TestFlight** → add the second device as an internal tester
5. **E3** and **F4** on that build
6. **Submit for review**
