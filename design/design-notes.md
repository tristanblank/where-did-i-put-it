# Design Spec — Bento (the keeper)

Reference implementation: `prototypes/bento-v1-KEEPER.jsx`.
Port this faithfully in Phase 2; everything below is extracted from it.

## Typeface

**Encode Sans Semi Expanded** — everywhere, weights 400–800.
Expo: `@expo-google-fonts/encode-sans-semi-expanded`.
Uppercase micro-labels use tightened tracking (~0.08em) since the
face is already wide.

## Color tokens

| Token | Light | Dark |
|---|---|---|
| bg | `#F2F4F7` | `#0F1115` |
| tile | `#FFFFFF` | `#1A1D24` |
| tileAlt | `#E9EDF2` | `#23262F` |
| ink | `#1B2029` | `#F2F4F8` |
| sub | `#66707D` | `#8B93A1` |
| border | `#E3E7ED` | `#2A2E38` |
| accent | `#2547D0` | `#6E8BFF` |
| accentInk | `#FFFFFF` | `#0F1115` |
| accentSoft | `#E4EAFB` | `#232B47` |
| danger | `#C0392B` | `#FF8A7A` |

Note: dark accent is deliberately lighter (periwinkle) — the light-mode
cobalt goes muddy on dark tiles.

## Signature element: the label path

Location rendered as chevron-separated chips:
`ROOM › SPOT › POSITION › CONTAINER`
Chips: accentSoft background, accent text, uppercase, 600–700 weight,
radius 5, whitespace nowrap. This is the brand — it appears on every
item card, the add-flow live preview, and eventually the app icon.

## Bento layout rules (home screen)

- 2-column grid, 12px gap, tile radius 20, hairline border + 1px shadow.
- Tile order: stat tile (accent bg, big count), add tile, room tiles,
  full-width "Recently stashed" (top 3).
- Rooms sort by item count; **the two busiest rooms span both columns**
  and show their latest item. Empty rooms show a muted count badge.
- No blur, no transparency stacking, no animated shadows — solid fills
  only. This is a performance decision, not just taste.

## Data model (client)

```
item: { id, name, room, spot, pos, container, note, updatedAt }
customRooms: [string]
customSpots: { [room]: [string] }
theme: "light" | "dark"
```

Default rooms/spots and the POSITIONS list live at the top of the
prototype file.

## Interaction notes

- Tapping a room tile drills into that room; "+ Stash here" pre-fills it.
- Search is global and matches every field (finding "blue box" should
  surface everything inside it).
- Item detail's primary action is "It moved — update" (edit with
  location pre-filled) — moving things is the core loop, not deleting.
