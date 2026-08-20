# Privacy Policy for Stasher

**Effective date:** 19 August 2026
**Last updated:** 19 August 2026

Stasher is a home-inventory app: you record where you put things, and the
people in your household can see the same list. This policy explains what
the app stores, where it lives, and what you can do about it.

Short version: Stasher stores your email address, the items you write
down, and — if you sign in with Google — the name and profile picture on
that Google account. There are no ads, no analytics, no trackers, and
nothing is sold or shared with anyone.

---

## Who is responsible

Stasher is an independent app published by **Tristan Blank**.

Questions, requests, or complaints: **stasherdotapp@gmail.com**

---

## What Stasher collects

### Account information

To sign in, Stasher records:

- **Your email address.** If you sign in with Apple and choose "Hide My
  Email," Apple gives the app a private relay address
  (`@privaterelay.appleid.com`) instead of your real one — in that case
  Stasher never receives your actual email address at all.
- **An account identifier.** A random ID for your account, plus the
  identifier Apple or Google provides if you sign in with one of those.

If you sign in with Google, Google also passes along the name and profile
picture on your Google account. Stasher doesn't use either one — nothing
in the app displays them — but they are stored with your account record,
so it would be wrong to say they aren't received.

Stasher does **not** collect your name from Apple, your phone number,
your contacts, your location, your photos, or your device's advertising
identifier. Signing in with Google gives Stasher no access to your Gmail,
Drive, calendar, or contacts — only the email address and name on the
account.

### The name you choose

You can optionally set a display name or nickname. It's whatever you type
— Stasher doesn't take it from your Apple or Google account, or your
email. It's
visible to the other people in your household, next to items you added,
and nowhere else. Leaving it blank is fine.

### What you write down

The content you enter about your belongings:

- Item names, and the room, spot, position, and container you record for
  each one
- Any note you add to an item
- Rooms and storage spots you create, and how you've customised them
- Your household's name

Please don't put anything in a note that you wouldn't want the other
members of your household to read — everyone in a household sees the same
items and notes.

### What Stasher does not collect

No analytics or usage tracking. No advertising or ad identifiers. No
crash-reporting service. No location data. No microphone or camera
access. No cookies. Stasher does not track you across other apps or
websites, and there is no third-party SDK in the app doing so on its
behalf.

---

## How your information is used

Only to make the app work:

- To sign you in and keep you signed in
- To store your items and sync them between the phones in your household
- To send you a sign-in code or link when you request one

Your information is **not** used for advertising, profiling, or
recommendations, and it is **not** sold, rented, or shared with data
brokers. There is no scenario in which your item data is used for
anything other than showing it back to your household.

---

## Households and who can see your data

A household is a shared space. Anyone who joins your household can see
every item in it, including items you added and the notes on them, and
can edit or delete them.

People join a household using an invite code. **Treat the invite code
like a password** — anyone who has it can join your household and see
everything in it. You can generate a new code at any time from the
household screen, which immediately stops the old one from working.
Generating a new code does not remove anyone who has already joined.

---

## Where your data is stored

Stasher uses **Supabase** (supabase.com) to store data and handle
sign-in. Data is hosted on Supabase's infrastructure in the **United
States**. If you are outside the United States, your information is
transferred and stored there.

Your session is kept on your phone in the device's secure storage — the
iOS Keychain — rather than in ordinary app storage. A copy of your
household's items is also cached on your phone so the app works without a
signal; that copy is removed when you sign out.

### Others involved

- **Supabase** — database, authentication, and email delivery for sign-in
  codes.
- **Apple** — if you use Sign in with Apple. Apple's own privacy policy
  governs what Apple does with that.
- **Google** — if you use Sign in with Google. Google's own privacy
  policy governs what Google does with that.

Nobody else receives your data.

---

## How long it's kept

Your account and items are kept until you delete them.

- **Deleting an item** removes it immediately.
- **Leaving a household** removes your access to it. If you were the last
  member, the household's contents are retained but hidden, so that
  rejoining with the invite code restores them. Contact us if you want a
  household you've left permanently erased.
- **Deleting your account** permanently deletes your account and sign-in
  details. If you signed in with Google, Stasher also revokes its own
  access, so it stops appearing in the list of connected apps on your
  Google account. If you were the only person in your household, the household
  and everything in it is deleted too. If other people are still in it,
  their items remain — they belong to the household, not to you alone.

---

## Your choices and rights

- **Delete your account at any time, from inside the app.** Open the
  household screen (the 👥 button) and choose "Delete account." No email
  request, no waiting.
- **Correct your information** by editing it in the app.
- **Get a copy of your data** by emailing the address above.

Depending on where you live, you may have additional rights under laws
such as the GDPR or the CCPA — including access, correction, deletion,
and portability. Email us and we'll honour them. Stasher does not sell
personal information, so there is nothing to opt out of in that respect.

---

## Children

Stasher is not directed at children under 13, and does not knowingly
collect information from them. If you believe a child has created an
account, email us and we'll delete it.

---

## Security

Access to your data is enforced at the database level: the server checks
on every single request that you are a member of the household whose data
you are asking for, rather than relying on the app to ask nicely. Sign-in
tokens are stored in the iOS Keychain. Traffic between the app and the
server is encrypted in transit.

No system is perfectly secure, and this is a small independent app rather
than a company with a security team. If you find a vulnerability, please
email us — we'd genuinely like to know.

---

## Changes to this policy

If this policy changes in a way that affects what's collected or how it's
used, the effective date above will change and the updated policy will be
posted at this address. Continuing to use Stasher after that means you
accept the updated policy.

---

## Contact

**stasherdotapp@gmail.com**
