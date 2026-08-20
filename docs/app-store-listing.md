# App Store Connect — listing copy and privacy answers

Everything needed to fill in App Store Connect. Draft copy; edit freely,
it's marketing rather than fact. The privacy section is **not** draft —
those answers have to match the schema and the privacy policy, and Apple
does cross-check them.

---

## Basics

| Field | Value |
|---|---|
| **App name** (30 chars) | `Stasher - Home Inventory` |
| **Subtitle** (30 chars) | `Stash Your Stuff` |
| **Primary category** | Productivity |
| **Secondary category** | Lifestyle |
| **Age rating** | 10+ |
| **Price** | Free |
| **Bundle ID** | `com.tb.wheredidiputit` |
| **Copyright** | `2026 Tristan Blank` |

Copyright is required and lives on the **version page**, under "General
App Information" — the same section as the routing-app-coverage field,
below App Review Information. Apple's format is the year the rights were
obtained followed by the rights holder: no © symbol (Apple adds it), no
"Copyright" prefix, no URL. Submission fails with "You must provide
copyright information" until it's set.

On the age rating: the questionnaire asks about user-generated content.
Items are only ever visible inside one household, joined by invite code —
that's private sharing, not public UGC, so it doesn't pull in guideline
1.2's moderation requirements. Every other category answers "none".

---

## Promotional text (170 chars — editable later without review)

```
Never lose the passport, the spare key, or the good scissors again. Write
down where you put it once; everyone in your house can find it.
```

---

## Description

```
Where did you put it?

The winter coats. The passport. The spare key to the shed. The good
scissors that vanish the moment anyone needs them.

Stasher is a shared memory for your household. Write down where something
is stashed, and it stays written down — for you, and for everyone else in the
house.

HOW IT WORKS

Stashing something takes a few taps. Pick the room, pick the spot, get
specific if it helps: Hallway, closet, bottom drawer. Living room,
bookshelf, top shelf. Add the container if it matters — "the blue box",
"the shoebox marked CABLES".

Then forget about it. That's the point.

SHARED WITH YOUR HOUSEHOLD

One person writes it down, everyone can find it. Invite the people you
live with using a single code, and you all see the same list, updating on
each other's phones in seconds. No more "do you know where..." shouted
between rooms.

You can see who added what, so it's obvious who to ask when the note
isn't enough.

BUILT FOR REAL HOUSES

- Organize by room, and add your own rooms — a garage, a shed, a car
- Rename and re-icon rooms so they match your actual home
- Search everything at once when you can't remember which room
- Works offline: the back of a closet has no signal, and stashing
  something there still works
- Light and dark themes

PRIVATE BY DESIGN

No ads. No trackers. No analytics. Nothing sold to anyone. Your household
is the only thing that can see your household's items, enforced by the
database itself rather than trusted to the app. Delete your account from
inside the app whenever you like, and it's actually deleted.

Stasher doesn't want your attention. It wants to tell you where the
passport is and get out of the way.
```

---

## Keywords (100 characters, comma-separated, no spaces)

```
inventory,storage,organize,household,family,declutter,moving,labels,find,stuff,home,shared,memory
```

96 characters. Don't repeat words from the app name or subtitle — Apple
already indexes those, so "stasher" and "remember" would be wasted.

---

## Required URLs — and they're on different pages

| Field | Where | Value |
|---|---|---|
| **Privacy Policy URL** | App Information | `https://tristanblank.github.io/where-did-i-put-it/privacy-policy` |
| **Support URL** | version page | `https://tristanblank.github.io/where-did-i-put-it/support` |
| **Marketing URL** | version page | optional, leave blank |

These two look like a pair and are entered in different places, which is
worth knowing before hunting for one on the wrong screen.

Support URL is also a **separate required field** from the privacy
policy — a missing or broken one is a rejection on its own. `docs/support.md`
in this repo is served at that address by the same GitHub Pages setup.

### Which page holds what

Three separate screens, and it isn't obvious which owns what:

**App Information** (left sidebar → General) — everything that applies to
every version: name, subtitle, **privacy policy URL**, category, content
rights, age rating.

**Version page** ("1.0 Prepare for Submission") — everything specific to
this release: screenshots, description, keywords, **support URL**, build,
App Review Information, version release.

**App Privacy** (left sidebar, its own item) — the nutrition label only.
Completing it does *not* fill in the privacy policy URL above.

Apple has been consolidating privacy settings, so the privacy policy URL
may appear under App Privacy rather than App Information on some
accounts. If it isn't in one, check the other.

---

## App Privacy — the nutrition label

App Store Connect → App Privacy → Edit. First question: does this app
collect data? **Yes.**

Declare exactly these four. For every one: purpose is **App
Functionality** only, it **is** linked to the user's identity, and it is
**not** used for tracking.

| Category | Data type | What it is here |
|---|---|---|
| Contact Info | **Email Address** | Sign-in. May be an Apple private-relay address. |
| Contact Info | **Name** | The display name a user types for themselves. |
| User Content | **Other User Content** | Item names, notes, rooms, spots, containers. |
| Identifiers | **User ID** | The account UUID, and Apple's `sub`. |

Final question — "Do you use data to track you?" — is **No**. That keeps
the app off the "Data Used to Track You" card and means no App Tracking
Transparency prompt is needed.

### Why Name is declared

It's optional in the UI and might be a nickname, but Apple has no
"optional" exemption: collected at all means declared. In practice people
type their real first name. Over-declaring costs nothing; under-declaring
is a compliance problem.

### Deliberately not declared

- **Usage Data / Analytics** — there is no analytics SDK
- **Diagnostics / Crash Data** — there is no crash reporter. Apple's own
  crash collection isn't the developer's to declare. **This changes the
  day Sentry is added** (it's in the Phase 6 notes).
- **Location, Contacts, Photos, Audio, Purchases, Browsing/Search
  History** — none of it is touched

Supabase's server logs record IP addresses, as any hosted API does.
Infrastructure logging of that kind isn't conventionally declared here and
isn't linked to a user in the product sense. That changes if IP is ever
read as a feature.

### Keep this consistent with the policy

`docs/privacy-policy.md` covers email, the chosen name, item content, and
an account identifier — the same four. Any change to one needs the same
change to the other.

---

## Review notes

Version page → **App Review Information** → **Notes**.

```
No demo account is needed. Sign in with Apple using any Apple ID, or
choose the email option and we'll send an 8-digit code to any address
you enter. There is no password.

To see household sharing, the app's main feature: after signing in,
create a household. The 👥 button on the home screen shows an invite
code. A second account entering that code on the "Join with a code"
screen sees the same items, syncing live between both.

Account deletion is in the app: 👥 button on the home screen →
"Delete account".
```

Two reasons this field isn't optional in practice.

**The sign-in wall.** That same section has a "Sign-in required" checkbox
with username and password fields. This app has no passwords, so there is
nothing to put in them — leave the box unchecked and say so in the Notes.
A reviewer who hits a sign-in screen with no credentials and no
explanation rejects under 2.1, and that is a wasted review cycle over a
paragraph.

**The feature is invisible to one account.** Household sharing is the
reason the app exists, and a single reviewer with a single account will
never stumble into it. Spelling out the invite-code flow is the
difference between it being evaluated and being missed.

## Version release

Version page → **Version Release** (last section, below Build) →
**"Manually release this version"**.

The default is automatic, so this has to be changed deliberately.
Manual keeps approval and launch as separate events, so the app goes live
when you decide rather than the moment a reviewer clicks approve.

Note that this choice does **not** carry over to the next version — each
new version page starts on automatic again.

---

## What's New (4000 chars) — 1.0.1

Only appears on a version after the first, so 1.0 had no such field.

```
Stasher now follows your iPhone's text size settings properly. If you use
larger text, headings no longer get cut off, icons stay the size they
should be, and the layout adjusts to fit — including when you change the
setting while the app is open.
```

Plain language on purpose: "Dynamic Type" is Apple's word for it, not
something a user reading the store page would search for or recognise.

---

## What's New (4000 chars) — 1.0.2

```
You can now sign in with Google, alongside Sign in with Apple and the
emailed sign-in code. Same household, same things in it — just one more
way in.
```

Everything else in 1.0.2 is invisible from the outside: the ID token now
carries the access token Supabase intends to start requiring, signing out
clears the Google account the SDK had cached, and deleting an account
revokes its Google grant. None of that is worth a line on a store page.

The one thing this release *does* change for an existing user: someone
who has been signing in with an emailed code now sees a Google button. If
they tap it with the same address, Supabase links the two identities and
they land in the household they already had. See
`backend/supabase/auth-config.md` for the mechanism.
