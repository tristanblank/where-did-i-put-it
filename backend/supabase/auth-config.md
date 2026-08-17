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

Three values, from **Google Cloud Console → APIs & Services →
Credentials**, and they are not interchangeable:

| Value | Where it goes |
|---|---|
| **iOS** client ID | `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` |
| **Web** client ID | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, *and* Supabase's **Authorized Client IDs** |
| Reversed **iOS** client ID | `iosUrlScheme` in `app.json` |

The Web client ID is required even though the app is iOS-only. Google
mints the ID token against the *web* client, and that is the audience
Supabase checks. Configure only `iosClientId` and the token comes back
with the wrong audience and Supabase rejects it — the sign-in sheet
succeeds and the app still doesn't let you in, which reads as a broken
account rather than a config error.

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

## Not enabled

**Leaked password protection** is a Pro feature and this project is on the
free plan. It's also close to moot here: it checks passwords against
HaveIBeenPwned when one is set, and no account has or needs a password.

---

## What breaks if this is lost

Recreating the project from `schema.sql` alone gives a working database
and a broken sign-in: emailed links pointing at localhost, and templates
sending links the UI doesn't describe. The database would look perfect
throughout.
