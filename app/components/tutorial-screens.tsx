import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { LabelPath } from '@/components/label-path';
import { Colors, Fonts } from '@/constants/theme';
import { baseTileStyle } from '@/constants/tile-style';

/**
 * Full-screen stand-ins for the screens the walkthrough talks about.
 *
 * Reconstructions, not screenshots: the same tiles, chips, label paths
 * and theme tokens the app is built from, filled with example data. That
 * costs more than bundling twelve PNGs and buys three things — they can't
 * go stale when the UI changes, they follow the current theme and text
 * size without a second set of assets, and no real household's invite
 * code ends up shipped inside the app binary.
 *
 * What it doesn't buy: pixel fidelity. Shadows and font metrics are the
 * platform's, so these are the app's layout rather than a capture of it.
 */

export type Tokens = (typeof Colors)['light' | 'dark'];
export type Scheme = 'light' | 'dark';

export type Rect = { x: number; y: number; width: number; height: number };

export type PartKey =
  | 'add-tile'
  | 'add-room-tile'
  | 'people-button'
  | 'move-update'
  | 'name-field';

export type ScreenKey = 'home' | 'item' | 'household';

/** The corner radius the spotlight ring should trace for each part. */
export const PART_RADIUS: Record<PartKey, number> = {
  'add-tile': 20,
  'add-room-tile': 20,
  'people-button': 999,
  'move-update': 14,
  'name-field': 12,
};

// ---------- measuring ----------

// The screen root, so a highlighted part can report where it sits inside
// its own screen rather than inside the window. Passed by context because
// the parts are nested several levels down and threading a ref through
// every intermediate view would be noise.
const ScreenRootContext = createContext<React.RefObject<View | null> | null>(null);

type SpotProps = {
  id: PartKey;
  target: PartKey | null;
  onRect: (rect: Rect) => void;
  style?: object;
  children: ReactNode;
};

/**
 * Wraps a highlightable element and reports its frame.
 *
 * Measured rather than hard-coded, because everything about where a tile
 * lands moves: the room list is a different length in each mock, and the
 * whole grid reflows to one column once the system text size passes the
 * threshold in use-large-text.
 */
// Retries while the tree is still settling. Ten frames is a sixth of a
// second — far longer than a mount takes, and short enough that a genuinely
// unmeasurable target gives up rather than polling forever.
const MEASURE_ATTEMPTS = 10;

function Spot({ id, target, onRect, style, children }: SpotProps) {
  const ref = useRef<View>(null);
  const rootRef = useContext(ScreenRootContext);
  const active = id === target;
  const measured = useRef(false);

  useEffect(() => {
    measured.current = false;
  }, [active]);

  // Measured exactly once, then frozen.
  //
  // The first version re-measured after every render and called back with
  // the result, which writes parent state from a value derived from the
  // parent's own output: reporting a rect moves the screen (the spotlight
  // pans it so the target is visible), which re-renders this, which
  // measures again. It only settles if the two measurements agree to the
  // last float, and there is no reason they must — the second one is taken
  // through an ancestor transform the first one didn't have.
  //
  // These mock screens are static, so one good measurement is all there is
  // to know. A text-size change remounts the whole walkthrough — it's keyed
  // on fontScale — which resets this along with everything else.
  const measure = (attempt: number) => {
    if (!active || measured.current) return;
    const node = ref.current;
    const root = rootRef?.current;
    const retry = () => {
      if (attempt < MEASURE_ATTEMPTS) requestAnimationFrame(() => measure(attempt + 1));
    };
    if (!node || !root) {
      retry();
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      root.measureInWindow((rootX, rootY, rootWidth) => {
        // A view that has not been placed yet measures as zero. That is
        // the ordering this guards: this view's onLayout can fire before
        // the root above it has been laid out at all.
        if (!width || !height || !rootWidth) {
          retry();
          return;
        }
        measured.current = true;
        // Whole points. Sub-pixel drift between measurements is exactly
        // the kind of difference that would look like a change worth
        // re-rendering for, and never is.
        onRect({
          x: Math.round(x - rootX),
          y: Math.round(y - rootY),
          width: Math.round(width),
          height: Math.round(height),
        });
      });
    });
  };

  return (
    // Arrow rather than a bare reference: onLayout passes a layout event,
    // which would arrive as the attempt counter.
    <View ref={ref} collapsable={false} onLayout={() => measure(0)} style={style}>
      {children}
    </View>
  );
}

type ScreenProps = {
  target: PartKey | null;
  onRect: (rect: Rect) => void;
  t: Tokens;
  theme: Scheme;
};

function ScreenRoot({ children, style }: { children: ReactNode; style?: object }) {
  const ref = useRef<View>(null);
  return (
    <ScreenRootContext.Provider value={ref}>
      <View ref={ref} collapsable={false} style={style}>
        {children}
      </View>
    </ScreenRootContext.Provider>
  );
}

// ---------- the parts ----------
//
// Each renders to fill whatever box it is given, so the identical call can
// be used three times over: in the screen (sized by its layout slot), as
// the un-dimmed copy the spotlight draws on top, and inside the
// magnifier. One definition, so the three can't drift apart.

export function renderPart(key: PartKey, t: Tokens, theme: Scheme): ReactNode {
  const tile = baseTileStyle(t, theme);

  switch (key) {
    case 'add-tile':
      return (
        <View style={[tile, styles.gridTile, styles.fill]}>
          <Text allowFontScaling={false} style={styles.tileIcon}>
            ➕
          </Text>
          <Text style={[styles.tileLabel, { color: t.ink }]}>Stash something</Text>
        </View>
      );

    case 'add-room-tile':
      return (
        <View style={[tile, styles.gridTile, styles.fill]}>
          <Text allowFontScaling={false} style={styles.tileIcon}>
            ➕
          </Text>
          <Text style={[styles.tileLabel, { color: t.sub }]}>Add a room</Text>
        </View>
      );

    case 'people-button':
      return (
        <View style={[tile, styles.roundButton, styles.fill]}>
          <Text allowFontScaling={false} style={styles.roundButtonIcon}>
            👥
          </Text>
        </View>
      );

    case 'move-update':
      return (
        <View style={[styles.primaryButton, styles.fill, { backgroundColor: t.accent }]}>
          <Text style={[styles.primaryButtonText, { color: t.accentInk }]}>Move/Update</Text>
        </View>
      );

    case 'name-field':
      return (
        <View
          style={[
            styles.input,
            styles.fill,
            { borderColor: t.border, backgroundColor: t.tileAlt },
          ]}>
          <Text style={[styles.inputText, { color: t.ink }]}>Dad</Text>
        </View>
      );
  }
}

// ---------- the screens ----------

const ROOMS: [string, string, number][] = [
  ['🍳', 'Kitchen', 6],
  ['🛏️', 'Bedroom', 4],
  ['🚪', 'Hallway', 3],
  ['🖥️', 'Office', 2],
];

function HomeScreenMock({ target, onRect, t, theme }: ScreenProps) {
  const tile = baseTileStyle(t, theme);

  return (
    <ScreenRoot style={[styles.screen, { backgroundColor: t.bg }]}>
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.eyebrow, { color: t.accent }]}>Household index</Text>
          <Text style={[styles.screenTitle, { color: t.ink }]}>Stasher</Text>
        </View>
        <View style={styles.headerButtons}>
          <Spot id="people-button" target={target} onRect={onRect}>
            {renderPart('people-button', t, theme)}
          </Spot>
          <View style={[tile, styles.roundButton]}>
            <Text allowFontScaling={false} style={styles.roundButtonIcon}>
              {theme === 'light' ? '🌙' : '☀️'}
            </Text>
          </View>
        </View>
      </View>

      <View style={[styles.search, { borderColor: t.border, backgroundColor: theme === 'dark' ? t.tileAlt : t.tile }]}>
        <Text style={[styles.searchText, { color: t.sub }]}>Search items, boxes, shelves…</Text>
      </View>

      <View style={styles.sortRow}>
        <Text style={[styles.sortLabel, { color: t.sub }]}>Sort rooms</Text>
        <View style={styles.sortPills}>
          <View style={[styles.chip, { backgroundColor: t.accent, borderColor: t.accent }]}>
            <Text style={[styles.chipText, { color: t.accentInk, fontFamily: Fonts.semiBold }]}>By count</Text>
          </View>
          <View style={[styles.chip, { backgroundColor: t.tile, borderColor: t.border }]}>
            <Text style={[styles.chipText, { color: t.ink }]}>A–Z</Text>
          </View>
        </View>
      </View>

      <View style={styles.grid}>
        <View style={[tile, styles.gridTile, styles.halfTile, { backgroundColor: t.accent, borderWidth: 0 }]}>
          <Text style={[styles.statNumber, { color: t.accentInk }]}>24</Text>
          <Text style={[styles.statLabel, { color: t.accentInk }]}>Things stashed</Text>
        </View>

        <Spot id="add-tile" target={target} onRect={onRect} style={styles.halfTile}>
          {renderPart('add-tile', t, theme)}
        </Spot>

        {ROOMS.map(([icon, name, count]) => (
          <View key={name} style={[tile, styles.gridTile, styles.halfTile]}>
            <Text allowFontScaling={false} style={styles.tileIcon}>
              {icon}
            </Text>
            <View style={styles.tileFoot}>
              <Text style={[styles.tileLabel, { color: t.ink }]}>{name}</Text>
              <View style={[styles.badge, { backgroundColor: t.accentSoft }]}>
                <Text style={[styles.badgeText, { color: t.accent }]}>{count}</Text>
              </View>
            </View>
          </View>
        ))}

        <Spot id="add-room-tile" target={target} onRect={onRect} style={styles.halfTile}>
          {renderPart('add-room-tile', t, theme)}
        </Spot>
      </View>
    </ScreenRoot>
  );
}

function ItemScreenMock({ target, onRect, t, theme }: ScreenProps) {
  const tile = baseTileStyle(t, theme);

  return (
    <ScreenRoot style={[styles.screen, styles.screenNoPad, { backgroundColor: t.bg }]}>
      {/* The navigation header, which is a real part of this screen — it
          is what tells you you're one level down from the room. */}
      <View style={[styles.navBar, { borderColor: t.border, backgroundColor: t.tile }]}>
        <Text style={[styles.navBack, { color: t.accent }]}>‹</Text>
        <Text style={[styles.navTitle, { color: t.ink }]}>Passport</Text>
      </View>

      <View style={styles.screenBody}>
        <View style={[tile, styles.panel]}>
          <Text style={[styles.itemName, { color: t.ink }]}>Passport</Text>
          <LabelPath parts={['Office', 'Filing cabinet', 'Top drawer']} size="md" />
          <Text style={[styles.itemNote, { color: t.sub }]}>Renewal due next spring.</Text>
          <Text style={[styles.itemMeta, { color: t.sub }]}>
            Last updated 12/08/2026, 18:04 · Added by Sam
          </Text>

          <View style={styles.itemActions}>
            <Spot id="move-update" target={target} onRect={onRect} style={styles.actionPrimary}>
              {renderPart('move-update', t, theme)}
            </Spot>
            <View style={[styles.deleteButton, { borderColor: t.border }]}>
              <Text style={[styles.deleteText, { color: t.danger }]}>Delete</Text>
            </View>
          </View>
        </View>
      </View>
    </ScreenRoot>
  );
}

function HouseholdScreenMock({ target, onRect, t, theme }: ScreenProps) {
  return (
    <ScreenRoot style={[styles.screen, styles.screenNoPad, { backgroundColor: t.bg }]}>
      {/* Drawn as the sheet alone rather than the sheet over a dimmed home
          screen. At this size the backdrop would be a dark band along the
          top and nothing else — it costs real estate and says nothing. */}
      <View style={[styles.sheet, { backgroundColor: t.tile, borderColor: t.border }]}>
        <Text style={[styles.sheetTitle, { color: t.ink }]}>The Fam</Text>
        <Text style={[styles.sheetSubtitle, { color: t.sub }]}>
          Share this code so someone else can join and see the same data.
        </Text>

        <View style={[styles.codeTile, { backgroundColor: t.tileAlt, borderColor: t.border }]}>
          <Text allowFontScaling={false} numberOfLines={1} style={[styles.codeText, { color: t.ink }]}>
            K7QM3XPD
          </Text>
        </View>

        <View style={[styles.shareButton, { backgroundColor: t.accent }]}>
          <Text style={[styles.shareButtonText, { color: t.accentInk }]}>Share invite code</Text>
        </View>

        <Text style={[styles.rotateText, { color: t.sub }]}>Generate a new code</Text>

        <View style={[styles.sheetSection, { borderColor: t.border }]}>
          <Text style={[styles.sectionLabel, { color: t.sub }]}>YOUR NAME</Text>
          <Spot id="name-field" target={target} onRect={onRect} style={styles.nameFieldSlot}>
            {renderPart('name-field', t, theme)}
          </Spot>
          <Text style={[styles.sectionHint, { color: t.sub }]}>
            This is what the rest of your household sees next to items you add.
          </Text>
        </View>

        <View style={[styles.sheetSection, { borderColor: t.border }]}>
          <Text style={[styles.sectionLabel, { color: t.sub }]}>2 PEOPLE IN THIS HOUSEHOLD</Text>
          <Text style={[styles.member, { color: t.ink }]}>Dad (you)</Text>
          <Text style={[styles.member, { color: t.ink }]}>Sam</Text>
        </View>
      </View>
    </ScreenRoot>
  );
}

const SCREENS: Record<ScreenKey, (p: ScreenProps) => ReactNode> = {
  home: HomeScreenMock,
  item: ItemScreenMock,
  household: HouseholdScreenMock,
};

export function renderScreen(key: ScreenKey, props: ScreenProps): ReactNode {
  return SCREENS[key](props);
}

const styles = StyleSheet.create({
  // flex rather than width/height 100%. A part is asked to fill three
  // differently-shaped boxes — a grid slot sized by minHeight, an
  // absolutely-positioned copy sized in points, and the magnifier's inner
  // view — and a percentage height only resolves against a parent whose
  // own height is already definite. Against a minHeight-only slot it
  // collapses to the content height, which left the bright copy taller
  // than the dimmed original it is meant to sit exactly on top of.
  fill: {
    flex: 1,
    alignSelf: 'stretch',
  },
  screen: {
    width: '100%',
    padding: 16,
    paddingTop: 20,
  },
  screenNoPad: {
    padding: 0,
    paddingTop: 0,
  },
  screenBody: {
    padding: 16,
  },

  // ---- home ----
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  eyebrow: {
    fontFamily: Fonts.bold,
    fontSize: 11,
    letterSpacing: 0.88,
    textTransform: 'uppercase',
  },
  screenTitle: {
    fontFamily: Fonts.bold,
    fontSize: 26,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  roundButton: {
    borderRadius: 999,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundButtonIcon: {
    fontSize: 18,
  },
  search: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 13,
    marginBottom: 16,
  },
  searchText: {
    fontFamily: Fonts.regular,
    fontSize: 16,
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sortLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  sortPills: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: {
    fontFamily: Fonts.regular,
    fontSize: 14,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  halfTile: {
    width: '48%',
    minHeight: 96,
  },
  gridTile: {
    minHeight: 96,
    padding: 16,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  tileIcon: {
    fontSize: 22,
  },
  tileLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: 15,
    flexShrink: 1,
  },
  tileFoot: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    gap: 8,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    fontFamily: Fonts.semiBold,
    fontSize: 11,
  },
  statNumber: {
    fontFamily: Fonts.bold,
    fontSize: 34,
  },
  statLabel: {
    marginTop: 4,
    fontFamily: Fonts.regular,
    fontSize: 10.5,
    letterSpacing: 0.84,
    textTransform: 'uppercase',
    opacity: 0.75,
  },

  // ---- item detail ----
  navBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  navBack: {
    fontFamily: Fonts.regular,
    fontSize: 26,
  },
  navTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: 17,
  },
  panel: {
    width: '100%',
    padding: 16,
    gap: 10,
  },
  itemName: {
    fontFamily: Fonts.bold,
    fontSize: 22,
  },
  itemNote: {
    fontFamily: Fonts.regular,
    fontSize: 14,
  },
  itemMeta: {
    fontFamily: Fonts.regular,
    fontSize: 11,
  },
  itemActions: {
    marginTop: 4,
    flexDirection: 'row',
    gap: 10,
  },
  actionPrimary: {
    flex: 1,
    minHeight: 46,
  },
  primaryButton: {
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  primaryButtonText: {
    fontFamily: Fonts.semiBold,
    fontSize: 15,
  },
  deleteButton: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: {
    fontFamily: Fonts.semiBold,
    fontSize: 15,
  },

  // ---- household sheet ----
  sheet: {
    borderTopWidth: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
  },
  sheetTitle: {
    fontFamily: Fonts.bold,
    fontSize: 18,
    textAlign: 'center',
  },
  sheetSubtitle: {
    marginTop: 6,
    fontFamily: Fonts.regular,
    fontSize: 13,
    textAlign: 'center',
  },
  codeTile: {
    marginTop: 20,
    paddingVertical: 18,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  codeText: {
    fontFamily: Fonts.bold,
    fontSize: 28,
    letterSpacing: 4,
  },
  shareButton: {
    marginTop: 16,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  shareButtonText: {
    fontFamily: Fonts.semiBold,
    fontSize: 15,
  },
  rotateText: {
    marginTop: 12,
    fontFamily: Fonts.regular,
    fontSize: 13,
    textAlign: 'center',
  },
  sheetSection: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  sectionLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: 11,
    letterSpacing: 1.1,
  },
  nameFieldSlot: {
    marginTop: 10,
    minHeight: 46,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  inputText: {
    fontFamily: Fonts.regular,
    fontSize: 15,
  },
  sectionHint: {
    marginTop: 8,
    fontFamily: Fonts.regular,
    fontSize: 12.5,
  },
  member: {
    marginTop: 8,
    fontFamily: Fonts.regular,
    fontSize: 15,
  },
});
