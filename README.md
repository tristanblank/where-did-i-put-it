# Stasher 🗄️

project pinned to SDK 54 until Expo Go for 57 clears App Store review — upgrade later with npx expo install expo@latest + --fix.

A household item location tracker. Log where you stashed things
("Hallway closet › Top shelf › Blue box"), search them later, sync
across the household.

## Folder map

```
where-did-i-put-it/
├── README.md            ← you are here
├── docs/
│   └── ship-plan.md     ← the phase-by-phase execution plan
├── design/
│   ├── design-notes.md  ← colors, font, bento layout rules (the spec)
│   └── prototypes/      ← working web prototypes from the design phase
│       ├── bento-v1.jsx   ← THE design to port in Phase 2

├── app/                 ← created in Phase 1 by `npx create-expo-app`
│                          (run it INSIDE this folder: the Expo project
│                           lives at where-did-i-put-it/app/)
├── backend/
│   └── supabase/
│       ├── schema.sql            ← Phase 4 starter schema (RLS included)
│       └── edge-functions/       ← v1.1 voice parser lives here later
└── assets/              ← app icon, splash screen, screenshots (Phase 3/5)
```

## Current status

- [x] Concept + prototypes
- [x] Ship plan written
- [ ] Phase 0 — accounts & setup
- [x] Phase 1 — Expo scaffold
- [x] Phase 2 — port the bento prototype
- [ ] Phase 3 — first TestFlight build
- [ ] Phase 4 — Supabase backend & household sync
- [ ] Phase 5 — store readiness
- [ ] Phase 6 — review & launch
- [ ] v1.1 — voice stashing & search (paid tier via RevenueCat)

## Ground rule

New feature ideas go in `docs/ship-plan.md` under v1.2+, not into the
current phase. (You wrote this rule. Future you: obey past you.)
