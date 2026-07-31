# iPad Support — Plan

**Status: not started. Deliberately after the iPhone launch.**

## Why it's worth doing

The likely audience skews older, and that group is disproportionately
iPad-primary — for plenty of people the iPad *is* the computer. A shared
home inventory also fits a use case that skews that way: a parent and an
adult child both able to answer "where are the insurance papers", without
one of them having to phone the other.

They aren't locked out today. iPhone-only apps appear in the iPad App
Store and run in a scaled window. So this is about the quality of the
experience, not availability — which is exactly why it can wait, and also
why it shouldn't wait forever.

## Do this first — it's cheaper and probably matters more

Before any iPad work, test the existing iPhone app at large text sizes:
**Settings → Accessibility → Display & Text Size → Larger Text**, cranked
to maximum.

React Native's `<Text>` honours that setting by default, so the copy
should scale — but the tiles are fixed-padding boxes with text inside, and
what happens at the largest sizes is unknown. If text clips or tiles
overflow, that affects far more older users than iPad support would, on
hardware they already own, and it's a much smaller fix.

Ten minutes on a build that already exists. Do it before committing to
anything below.

## The one-way door

Adding device support later is routine. **Removing it after shipping is
not** — existing iPad users lose access, and Apple pushes back. So
`supportsTablet: false` today costs nothing and keeps the option open,
while shipping a stretched layout would lock in support for a layout
nobody designed.

This is why the flag was set to `false` before launch rather than left at
Expo's default of `true`.

## Two levels of effort

### Letterbox — a few hours

Cap content at roughly 700pt and centre it. On iPad it reads as a wide
phone: unremarkable, but not broken. Plenty of shipped apps do exactly
this and it passes review.

The layout is percentage-based (`48%`, `100%` in `app/index.tsx`) rather
than fixed pixels, so it stretches rather than breaking — which is what
makes this version genuinely cheap.

### Proper — a weekend

1. **Width breakpoints.** `useWindowDimensions()`, and `48%` becomes
   `31%` or `23%` above ~768pt so the bento grid runs 3–4 columns. Mostly
   `app/index.tsx`, some of `app/room/[room].tsx`.
2. **The sheets.** `household-sheet.tsx`, `room-actions-sheet.tsx` and
   `add-room-sheet.tsx` are all bottom sheets with rounded top corners
   spanning the full width. At 13" that reads as a rendering bug. They
   want to become centred modals with a max width.
3. **Orientation.** Currently `portrait` only. iPad users expect
   landscape, and Split View multitasking requires supporting all
   orientations. This is the real design decision — supporting landscape
   means the layout has to survive arbitrary widths, not just two fixed
   ones.

## The practical blocker

**iPad screenshots require a physical iPad.** No simulator on Windows —
the same constraint that made the iPhone screenshots a manual job. The
resizer already has an `ipad-13` preset (2064×2752), but something has to
produce the source images.

Worth sorting out *before* starting the layout work, since borrowing an
iPad is the kind of dependency that strands a finished branch for a week.

## Shipping it

1. Accessibility text-size test on the current build (above)
2. Decide letterbox vs proper
3. `supportsTablet: true` in `app.json`
4. Layout work
5. Bump `expo.version` to 1.1.0
6. Screenshots on a real iPad → `npm run screenshots -- --preset ipad-13`
7. Production build → `eas submit` → TestFlight
8. **Test on an actual iPad**, not just a resized simulator window
9. Submit for review

**It needs full App Review** — every new binary does. Nothing special
about adding device support; it's an ordinary version-update review, 1–2
days. Existing iPhone users are unaffected either way.

The one real risk: reviewers *will* test on iPad once you claim support.
A stretched phone layout gets rejected under 4.0 (Design). That's the
reason the layout work isn't optional in the way a silent flag flip would
be.

## Related

Android is a similar shape of problem — the app works, the layout needs a
pass — and is already in the v1.2+ list in `ship-plan.md`. If both happen,
doing the responsive layout once serves both.
