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
| **Subtitle** (30 chars) | `Remember where you put it` |
| **Primary category** | Productivity |
| **Secondary category** | Lifestyle |
| **Age rating** | 4+ |
| **Price** | Free |
| **Bundle ID** | `com.tb.wheredidiputit` |

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
lives, and it stays written down — for you, and for everyone else in the
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

## Required URLs

| Field | Value |
|---|---|
| **Privacy Policy URL** | `https://tristanblank.github.io/where-did-i-put-it/privacy-policy` |
| **Support URL** | `https://tristanblank.github.io/where-did-i-put-it/support` |
| **Marketing URL** | optional, leave blank |

Support URL is a **separate required field** from the privacy policy —
a missing or broken one is a rejection. `docs/support.md` in this repo is
served at that address by the same GitHub Pages setup.

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

## Review notes (optional field, worth filling in)

```
Sign in with Apple, or with an email one-time code — no password.

Household sharing works by invite code: create a household, then share
the code from the 👥 button on the home screen. A second account entering
that code sees the same items.

Account deletion is in the app: 👥 button on the home screen -> "Delete
account".
```

Giving the reviewer the invite-code flow up front saves a round trip —
the sharing feature is otherwise hard to exercise with a single account.
