# Release Runbook

Every command needed to build, test, and ship. Run all of them from the
`app/` directory.

---

## Before any build

EAS uploads your **committed git state**, not your working tree. Anything
uncommitted is simply not in the build.

```bash
git status --short          # must be empty
git log --oneline -1        # note this — it's what you're building
```

Confirm the profile you're building has its environment variables. A
production build without them **crashes on launch** — no Supabase URL, no
client, and the app throws before the first screen renders. This is a
guaranteed 2.1 rejection and it has already nearly happened once.

```bash
eas env:list --environment production
eas env:list --environment preview
```

Both must show `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_ANON_KEY`. If one is missing:

```bash
eas env:create --environment production \
  --name EXPO_PUBLIC_SUPABASE_URL --value "https://<ref>.supabase.co" \
  --visibility plaintext --scope project
```

`plaintext` is correct, not `secret` — anything prefixed `EXPO_PUBLIC_` is
inlined into the client bundle by design. The anon key is safe there; RLS
is what protects the data.

---

## Preview build — for testing

Ad-hoc distribution. Installs only on devices whose UDIDs are registered.

```bash
eas build --profile preview --platform ios
```

When it finishes you get a build page URL. **Open that on the iPhone** and
tap Install. It replaces whatever build is there — same bundle id, so
there is never a choice of two icons, and the session and local cache
carry over.

### Adding someone else's device

```bash
eas device:create
```

Produces a registration link. They open it on their iPhone and install a
profile. **Then rebuild** — registering a device does not retroactively
add it to an existing build, because the provisioning profile is baked in
at build time.

---

## Production build — for the App Store

```bash
eas build --profile production --platform ios
```

Differences from preview: store distribution, App Store signing, and the
build number auto-increments (`autoIncrement: true`).

The marketing version — `expo.version` in `app.json`, currently `1.0.0` —
is **not** automatic. Edit it by hand when shipping a new version, and
create the matching version record in App Store Connect.

---

## Submitting

```bash
eas submit --platform ios --profile production --id <build-id>
```

Uploads that build to App Store Connect. Apple then processes it for
10–30 minutes and emails you when it lands in TestFlight.

Prefer `--id` over `--latest`. `--latest` means the newest iOS build of
any profile, so a preview build made after the production one gets
submitted instead — an ad-hoc-signed binary App Store Connect will
reject. Get the id from `eas build:list --profile production --limit 1`
and check its `Commit` before submitting.

`ascAppId` is set in the `production` submit profile, which is what lets
this run `--non-interactive`. Without it the command stops and asks,
which is fine by hand and a hang in a script.

**TestFlight is not App Review.** You can iterate on TestFlight builds
freely; review only starts when you explicitly submit a version from App
Store Connect.

Do **not** use `--auto-submit` on the build command. It chains build and
submit together and removes the chance to look at the build first.

---

## Checking on a build

```bash
eas build:list --limit 5
eas build:view <build-id>
```

Worth checking `Commit` in that output against what you meant to build.
It has caught a stale build before.

---

## Screenshots

Raw phone screenshots go in `app/store-assets/raw/`, named in the order
you want them shown (`01-home.png`, `02-add-item.png`, …).

```bash
npm run screenshots                          # 6.9" — 1320x2868
npm run screenshots -- --preset iphone-6.7   # 1290x2796
npm run screenshots -- --preset iphone-6.5   # 1242x2688
npm run screenshots -- --preset ipad-13      # 2064x2752
```

Output lands in `app/store-assets/<preset>/`, ready to upload.

**The script clears its output directory each run**, so `raw/` must hold
the complete set every time. Regenerating after removing one source file
deletes its old output rather than leaving it behind — that's deliberate
(it prevents uploading duplicates from a previous run) but it means you
can't build up a set incrementally.

`store-assets/` is gitignored: real household data, and a raw grab of the
household sheet contains a live invite code.

---

## Database changes

Applied through the Supabase MCP tools or the SQL editor. Two rules:

- Every applied migration gets a matching file in
  `backend/supabase/migrations/`
- `backend/supabase/schema.sql` is updated to match, so a from-scratch run
  of that file reproduces the same end state

Check the linters after any DDL:

```
get_advisors(type: "security")
get_advisors(type: "performance")
```

---

## The order that works

1. `git status` clean, note the commit
2. Bump `expo.version` in `app.json` by hand — the build number
   auto-increments, the marketing version never does
3. `eas env:list --environment production` — variables present
4. `eas build --profile production --platform ios`
5. **Check the finished build's `Commit` is the one you meant.** 1.0 was
   released from a binary three commits stale because this step was
   skipped: the fixes existed, were committed, and had only ever gone
   into preview builds
6. `eas submit --platform ios --profile production --id <build-id>`
7. Wait for Apple to finish processing
8. TestFlight → verify on a real device, including Sign in with Apple
   (release signing differs from development, and only this build proves
   it works)
9. App Store Connect → create the version record, attach the build, set
   **Manually release this version** (each new version starts on
   automatic), then submit for review

Steps 7–9 are where a bad build costs a day. Steps 1–3 are thirty seconds
and have already caught one launch-blocking problem.

`eas submit` uploads; it does not start review. Nothing reaches a
reviewer until step 9.
