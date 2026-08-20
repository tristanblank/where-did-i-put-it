# Supabase Auth configuration

`schema.sql` reproduces the database. **It does not reproduce any of
this** — auth settings live in the Supabase dashboard, not in Postgres, so
none of it is captured by a migration or recoverable from this repo
without the list below. Every item here was arrived at by breaking
something first.

---

## URL Configuration

**Authentication → URL Configuration**

| Setting | Value |
|---|---|
| Site URL | `https://tristanblank.github.io/where-did-i-put-it/` |
| Redirect URLs | `stasher://**` |

The default Site URL is `http://localhost:3000`, and it stayed that way
into Phase 5. Supabase validates `emailRedirectTo` against the redirect
allow-list and **silently discards it** if there's no match, falling back
to Site URL — so every emailed link pointed at a dev server that wasn't
running. Nothing errors; the link just goes nowhere.

Site URL is deliberately the public docs page rather than a deep link, so
a stray link opened on a desktop lands somewhere real.

---

## Email templates

**Authentication → Email Templates**

Both of these send **only `{{ .Token }}`** — an 8-digit code, no link:

- **Confirm signup** — used for an address that has never signed in
- **Magic Link** — used for a returning address

They are separate templates and it is easy to change one and miss the
other. That happened: Magic Link was made code-only while Confirm signup
still sent a link, so new users read "enter the code we sent you" and
opened an email containing no code.

### Why code-only

Magic links on mobile are structurally fragile. The mail client may open
its own in-app browser, the deep link may not fire, and under PKCE a link
opened on a *different* device than requested it cannot work at all —
the verifier is local to the requesting device. A typed code has none of
those failure modes and works cross-device.

It also removes a sharp edge: a link and its code are the same one-time
token, so tapping a link that fails to complete **spends the code too**.
The user is then told an apparently valid code is invalid.

### If a template ever sends a link again

`auth-store.tsx` still handles the deep link, so it will work — the client
is configured for PKCE (`flowType: 'pkce'` in `supabase.ts`) and reads
`?code=`. What must not happen is the client running the implicit flow
while the handler expects PKCE: the link arrives, matches nothing, is
discarded, and takes the code down with it. That was a real bug.

---

## Providers

**Authentication → Sign In / Providers**

- **Apple** — enabled. The client uses `signInWithIdToken` with a
  SHA-256-hashed nonce, so no OAuth redirect is involved.
- **Email** — enabled, used only for OTP codes.
- **Google** — enabled. Also `signInWithIdToken`, from a native sheet, so
  again no OAuth redirect and no `stasher://` callback.

### Google's client IDs

Three values, from **Google Cloud Console → APIs & Services → Google Auth
Platform → Clients** (the old "OAuth consent screen" menu is gone), and
they are not interchangeable:

| Value | Where it goes |
|---|---|
| **iOS** client ID | `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` |
| **Web** client ID | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, *and* Supabase's **Authorized Client IDs** |
| Reversed **iOS** client ID | `iosUrlScheme` in `app.json` |

Recorded here because only the reversed one is committed — the other two
live in EAS environment variables and a gitignored `.env.local`, so
nothing else in the repo would let you rebuild this. They are public
identifiers that ship inside the binary; there is no secret among them.

Google Cloud project `Stasher`, project number `730159609010`:

```
iOS       730159609010-e9t5lfsq66q8td3s8pn0c1evftoarpf6.apps.googleusercontent.com
Web       730159609010-vapt1rhhhlik7vfcab2b774b035epvp5.apps.googleusercontent.com
Reversed  com.googleusercontent.apps.730159609010-e9t5lfsq66q8td3s8pn0c1evftoarpf6
```

The **client secret** on the Web client is not used and must not be. The
native flow exchanges an ID token, which Supabase verifies against
Google's public keys. A secret has no home in an `EXPO_PUBLIC_` variable
— anything with that prefix is inlined into the JS bundle.

The Web client ID is required even though the app is iOS-only. Google
mints the ID token against the *web* client, and that is the audience
Supabase checks. Configure only `iosClientId` and the token comes back
with the wrong audience and Supabase rejects it — the sign-in sheet
succeeds and the app still doesn't let you in, which reads as a broken
account rather than a config error.

**Confirmed on the first real attempt.** Supabase's *Authorized Client
IDs* had not taken the Web ID, and `auth_logs` gave:

```
invalid request: Unacceptable audience in id_token:
[730159609010-vapt1rhhhlik7vfcab2b774b035epvp5.apps.googleusercontent.com]
```

The audience in that message is the **Web** client ID, which settles
which one the native SDK signs against on iOS: the web one. It is the
value that must appear in Authorized Client IDs. Listing the iOS ID as
well is harmless but not what makes it work.

The field takes a comma-separated list, and a stray space around the
comma is enough to stop it matching. One value is easier to get right.
The app shows only "Sign in with Google failed. Please try again," so
`auth_logs` is the only place this is visible.

### The second wall: the nonce check

Fixing the audience does not finish it. The next attempt failed with a
different error:

```
invalid request: Passed nonce and nonce in id_token should either both
exist or not.
```

Google mints an ID token carrying a `nonce` claim and the client passes
none. `signInWithGoogle` cannot simply supply one: the public build of
`@react-native-google-signin` does not accept a custom nonce
(react-native-google-signin/google-signin#1176), which is why Supabase's
own docs steer that library's users to `signInWithOAuth` instead.

The fix is **Skip nonce check**, on the same Google provider page. It is
what Supabase's Login with Google guide prescribes for iOS.

That is a real reduction and not a formality: nonce validation is what
stops a captured ID token being replayed. It also stops the check for
Apple, whose tokens *do* carry a nonce this app generates and passes
correctly. Accepted because the alternative is giving up the native
sheet for a browser redirect. Revisit if nonce support ever reaches the
library's public build.

**Both fields have to be right in the same save.** The save that enabled
the nonce skip also cleared Authorized Client IDs, so the audience error
came straight back and read as the nonce fix having failed.

Confirmed working 2026-08-20 01:13 UTC: `user_signedup` with
`"traits":{"provider":"google"}` and `login_method: oidc`.

### The at_hash warning

Every successful Google sign-in also logs:

```
ID token has a at_hash claim, but no access_token parameter was
provided. In future versions, access_token will be mandatory as it's
security best practice.
```

Sign-in succeeds today; this is a deprecation notice. GoTrue intends to
require the access token alongside the ID token, and the release that
enforces it would break Google sign-in for every user at once.

`signInWithGoogle` now sends one, from `GoogleSignin.getTokens()`, so
that release arrives as a no-op here. It is not only silence bought:
given an `access_token`, GoTrue checks the `at_hash` claim against it
instead of ignoring the claim.

The iOS OAuth client must carry the bundle id `com.tb.wheredidiputit`.
Google matches on it, and a mismatch fails at the sheet.

**The OAuth consent screen has to be Published.** Left in "Testing" —
its default — only accounts explicitly added as test users can sign in,
capped at 100, and everyone else gets "app is blocked". Publishing does
not require Google's review as long as the scopes stay limited to email
and profile, which is all this app requests.

`iosUrlScheme` is a build-time literal in `app.json`, so it is **not**
covered by the env-var check in the release runbook, and the app-side
guard that hides the Google button can't see it either. Getting the env
vars right and the URL scheme wrong yields a visible button that fails
mid-flow. Check it by eye before a build.

Password sign-in is not used by any screen. One account acquired a
password from the dashboard's "Add user" form, which requires one; it was
cleared, since it was a credential guarding real data on an endpoint the
app never uses.

**Allow new users to sign up** stays **on** — the app is public.

---

## Custom SMTP — not optional

**Authentication → Emails → SMTP Settings**

Supabase's default email service caps sending at **2 messages per hour**
and carries **no delivery or uptime SLA** — it is documented as being for
exploration and demos, not production. Email one-time code is one of only
two ways into this app, so 1.0 shipped on a sender that could serve about
two sign-ins an hour across all users.

The docs also say the default service **refuses any address that is not a
member of the project's organization**, failing with `Email address not
authorized`. **That did not match observed behaviour here.** On 17–18
August, before custom SMTP was configured, `auth_logs` shows successful
`/otp` and `/verify` for `pscattan@gmail.com` and `allaleventul@gmail.com`
— real users sent the App Store link, not org members. Whatever the
documented rule is, it was not being enforced on this project.

Recorded because it cuts both ways: don't assume the restriction protects
you from anything, and don't assume it will keep letting strangers
through either. The rate limit was reason enough on its own.

The client hides all of it: `handleEmailCode` in `sign-in.tsx` catches
any send failure and shows "Couldn't send the code. Check the address and
try again," so a server-side problem reads as the user's own typo.

### Provider: Brevo

Chosen because it needs no domain. We don't own one — the public pages
are on `tristanblank.github.io`, a GitHub subdomain with no DNS access,
so SPF/DKIM domain verification isn't possible.

| Field | Value |
|---|---|
| Host | `smtp-relay.brevo.com` |
| Port | `587` (STARTTLS; 465 and 2525 also offered) |
| Username | the **SMTP login** shown in Brevo's SMTP tab — newer accounts show a generated `…@smtp-brevo.com` address rather than the account email, so read it off the dashboard rather than assuming |
| Password | the **SMTP key**, generated in Brevo under **SMTP & API → SMTP**. Not the account password and not an API key — those fail with `535` |
| Sender email | `stasherdotapp@gmail.com` — validated under **Senders, Domains & Dedicated IPs → Senders** by clicking a link Brevo emails to that inbox |
| Sender name | `Stasher` |
| Free tier | 300 emails/day |

The sender does not have to match the Brevo account login; senders are
managed separately and several can be validated. It must match what's in
Supabase's Sender email field **exactly**, or Brevo refuses the message
at send time.

`stasherdotapp@gmail.com` is deliberate rather than convenient: it is
already the contact address published in `docs/support.md` and
`docs/privacy-policy.md`, which sit behind the App Store Support and
Privacy Policy URLs. Codes now come from the same address users are told
to write to.

Copy the SMTP key with no leading or trailing whitespace. A single stray
character produces a `535` that reads like wrong credentials.

### What actually happens to the sender: the brevosend.com rewrite

`gmail.com` cannot be authenticated in Brevo — domain authentication
needs DNS control, and that domain is Google's. Rather than send
unauthenticated mail that Gmail and Yahoo would refuse under their
February 2024 sender rules, Brevo **silently rewrites the sending domain
to `@brevosend.com`**, which it can DKIM-sign itself.

Confirmed in practice: the first working code arrived from a
`brevosend.com` sender, not from `stasherdotapp@gmail.com`.

So the mail is properly authenticated and does get delivered — the
earlier worry about failing DMARC alignment was the wrong mechanism. The
costs are paid elsewhere:

- **Sign-in codes arrive from a domain the user has never seen.** It is
  the most phishing-shaped message the app sends, and it arrives looking
  like phishing.
- **No sending reputation accrues to us.** We inherit `brevosend.com`'s,
  shared with Brevo's entire free tier. Spam placement is a real risk
  with no lever to improve it.
- **It is not a toggle.** The rewrite applies whenever the sender domain
  is unauthenticated. Owning a domain is the only exit.

Set the Sender name to `Stasher`. The display name is what Gmail shows
most prominently, and it is the only part of the sender we control.

Accepted deliberately to ship without buying a domain. The fix, when it
comes, is a domain plus Brevo's DKIM records — nothing in this repo
changes, and the same domain would also replace the `github.io` Support
and Privacy Policy URLs on the App Store listing.

### The 525 that blocks it on day one

Brevo enables **IP security** by default on accounts created after
16 May 2024, so a new account refuses the very first send with
`525 "5.7.1 Unauthorized IP address"` — before authentication is even
attempted. It looks like a credentials problem and isn't; wrong
credentials give `535`.

Fix at **Brevo → Settings → Security → Authorized IPs → Deactivate
blocking**. Deactivate rather than allowlist: Supabase sends from a pool
of IPs it neither publishes nor holds stable, so any list would work
today and fail silently later. Also check the **Unauthorized** list is
empty — an address there stays blocked even if it is also listed as
authorized.

The app surfaces none of this. `handleEmailCode` in `sign-in.tsx` shows
"Couldn't send the code. Check the address and try again," so the failure
reads as the user's own typo. The real error is in **auth_logs**, which
is where to look first when codes stop arriving.

### After enabling it

Supabase drops a fresh **30 messages/hour** limit on newly configured
SMTP to protect its own reputation. At one code per sign-in attempt that
is low for a public app, and it fails the same silent way. Raise it at
**Authentication → Rate Limits**.

---

## Not enabled

**Leaked password protection** is a Pro feature and this project is on the
free plan. It's also close to moot here: it checks passwords against
HaveIBeenPwned when one is set, and no account has or needs a password.

---

## What breaks if this is lost

Custom SMTP is the one whose absence is invisible from the app's side: no
error in the logs the client can see, no crash, just codes that never
arrive for anyone outside the organization.


Recreating the project from `schema.sql` alone gives a working database
and a broken sign-in: emailed links pointing at localhost, and templates
sending links the UI doesn't describe. The database would look perfect
throughout.
