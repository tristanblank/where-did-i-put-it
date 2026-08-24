import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spotlight } from '@/components/tutorial-spotlight';
import type { PartKey, ScreenKey } from '@/components/tutorial-screens';
import { Fonts } from '@/constants/theme';
import { useLargeText } from '@/hooks/use-large-text';
import { useTheme } from '@/hooks/use-theme';
import { useItemsStore } from '@/lib/items-store';

type TutorialProps = {
  onDone: () => void;
};

type Slide = {
  key: string;
  screen: ScreenKey;
  /** null for the opening slide, which shows the home screen undimmed. */
  target: PartKey | null;
  title: string;
  body: string;
};

const SLIDES: Slide[] = [
  {
    key: 'welcome',
    screen: 'home',
    target: null,
    title: 'Welcome to Stasher',
    body: 'This is home: everything your household has put somewhere, counted up and sorted into rooms. Everyone who joins sees the same list, on every phone, the moment it changes.',
  },
  {
    key: 'add',
    screen: 'home',
    target: 'add-tile',
    title: 'Stash something',
    body: 'Give it a name, then pick the room, the spot in that room, and where in that spot. Only the name and the room are required — everything after that is how you find it in a hurry.',
  },
  {
    key: 'update',
    screen: 'item',
    target: 'move-update',
    title: 'Moved it? Update it',
    body: 'Tap any item — from search, from a room, or from Recent updates — and Move/Update changes where it lives. Everyone else’s phone catches up on its own.',
  },
  {
    key: 'rooms',
    screen: 'home',
    target: 'add-room-tile',
    title: 'Make the rooms yours',
    body: 'The rooms you start with are only a suggestion. Add one for a garage, a shed, a storage unit. Press and hold any room tile to rename it, change its icon, or delete one that’s empty.',
  },
  {
    key: 'invite',
    screen: 'home',
    target: 'people-button',
    title: 'Share your join code',
    body: 'This button holds your household’s invite code. Anyone who enters it joins and sees the same items straight away. Lost track of who has it? Generate a new one — the old code stops working, and everyone already in stays in.',
  },
  {
    key: 'name',
    screen: 'household',
    target: 'name-field',
    title: 'Put your name on it',
    body: 'In that same sheet, add a name or nickname. It’s what the rest of the household sees next to the things you add — which settles most of the arguments about who moved what.',
  },
];

/**
 * The first-run walkthrough.
 *
 * Rendered as a plain absolutely-positioned view rather than the `Modal`
 * every other sheet in this app uses. On iOS a Modal is presented in its
 * own UIWindow, which sits above everything the app draws — including the
 * splash overlay in the root layout, which is still animating when the
 * home screen first mounts. As an ordinary view it stays underneath, and
 * the walkthrough is revealed by the splash fading out instead of
 * appearing on top of it.
 *
 * Each slide is a whole screen with one element lifted out of the gloom
 * and repeated, magnified, underneath it. See tutorial-screens.tsx for
 * why those screens are rebuilt from components rather than screenshotted.
 */
export function Tutorial({ onDone }: TutorialProps) {
  const t = useTheme();
  const { theme } = useItemsStore();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // Remounts on a text-size change, and re-measures the pages at the new
  // width; see the note on the home screen for why the remount is needed.
  const { fontScale, isLarge } = useLargeText();
  const scrollRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [index, setIndex] = useState(0);

  const last = index === SLIDES.length - 1;

  // Built once, not per render — these were being constructed inline in
  // the dots' map, so every render hung fresh animated nodes off scrollX,
  // which the native animated module owns.
  //
  // One interpolation per property, straight off the scroll offset, rather
  // than a subtraction feeding two chained interpolations. It says the same
  // thing with a third of the nodes, and it is the shape every paging
  // indicator in React Native uses — worth staying on the well-trodden path
  // for a graph that is evaluated natively and can't be stepped through.
  const dots = useMemo(
    () =>
      SLIDES.map((_, i) => {
        const range = [(i - 1) * width, i * width, (i + 1) * width];
        return {
          opacity: scrollX.interpolate({
            inputRange: range,
            outputRange: [0.22, 1, 0.22],
            extrapolate: 'clamp',
          }),
          scale: scrollX.interpolate({
            inputRange: range,
            outputRange: [0.7, 1, 0.7],
            extrapolate: 'clamp',
          }),
        };
      }),
    [scrollX, width]
  );

  // The frame takes what's left after the chrome and the copy, within
  // limits: too short and the screen inside it is a letterbox, too tall
  // and the title falls below the fold on a small phone.
  const frameWidth = Math.min(width - 48, 360);
  const frameHeight = Math.max(240, Math.min(height * 0.42, 380));

  const goTo = (next: number) => {
    const clamped = Math.max(0, Math.min(SLIDES.length - 1, next));
    scrollRef.current?.scrollTo({ x: clamped * width, animated: true });
    // Set here as well as in onMomentumScrollEnd: the button's label
    // changes to "Start stashing" on the last slide, and waiting for the
    // scroll to settle makes that lag the tap that caused it.
    setIndex(clamped);
  };

  // The pager is keyed on fontScale, so a text-size change remounts it and
  // it comes back scrolled to the first slide. Without this the index — and
  // with it the dots and the button label — would still claim to be
  // wherever the reader was.
  useEffect(() => {
    setIndex(0);
    scrollX.setValue(0);
  }, [fontScale, scrollX]);

  // Android's back gesture steps back through the walkthrough, and closes
  // it from the first slide. Without this it would fall through to the
  // navigator and leave the walkthrough sitting over whatever it landed
  // on, since this isn't a route.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (index === 0) {
        onDone();
      } else {
        goTo(index - 1);
      }
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, width]);

  return (
    <View style={[styles.fill, { backgroundColor: t.bg, paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Text style={[styles.stepCount, { color: t.sub }]}>
          {index + 1} of {SLIDES.length}
        </Text>
        {/* Kept on every slide including the last, and drawn as a button
            rather than as a line of grey text. This is a walkthrough
            nobody asked for, shown on first launch — the way out of it
            should be as findable as the way through, and styling it like
            a caption made it look decorative next to a full-width Next. */}
        <Pressable
          onPress={onDone}
          hitSlop={12}
          style={[styles.skip, { borderColor: t.border, backgroundColor: t.tile }]}>
          <Text style={[styles.skipText, { color: t.ink }]}>Skip tour</Text>
        </Pressable>
      </View>

      {/* Animated.ScrollView, not ScrollView.

          With useNativeDriver, Animated.event returns an AnimatedEvent
          *object* rather than a handler function — it is meant to be
          picked up by AnimatedProps, which only wraps Animated
          components. Handed to a plain ScrollView it arrives as the
          onScroll prop unchanged, and the first scroll event calls it:
          "onScroll is not a function", thrown inside an event handler,
          which is neither caught by the error boundary nor survivable in
          a release build. That is what killed the app on the first swipe
          and on Next, which scrolls too. */}
      <Animated.ScrollView
        key={fontScale}
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
          useNativeDriver: true,
        })}
        onMomentumScrollEnd={(e) => {
          setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
        }}>
        {SLIDES.map((slide, i) => (
          <View key={slide.key} style={{ width }}>
            {/* Each page scrolls on its own. At the largest text sizes the
                body copy alone is taller than the screen, and a page that
                can't reach its own last line is worse than one that has to
                be scrolled. */}
            <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
              {/* Only the slides either side of the current one are built.
                  Six screens' worth of tiles mounted at once is a lot of
                  views to lay out while the splash is still fading, and
                  every one of them re-measures on a text-size change. */}
              {Math.abs(i - index) <= 1 ? (
                <Spotlight
                  screen={slide.screen}
                  target={slide.target}
                  width={frameWidth}
                  height={frameHeight}
                  t={t}
                  theme={theme}
                />
              ) : (
                <View style={{ width: frameWidth, height: frameHeight }} />
              )}
              <Text style={[styles.title, { color: t.ink }]}>{slide.title}</Text>
              <Text style={[styles.body, { color: t.sub }]}>{slide.body}</Text>
            </ScrollView>
          </View>
        ))}
      </Animated.ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16, borderColor: t.border }]}>
        <View style={styles.dots}>
          {/* Driven by the scroll position rather than the settled index,
              so the dots track a half-finished swipe and tell you the
              gesture is working before you commit to it. */}
          {SLIDES.map((slide, i) => (
            <Animated.View
              key={slide.key}
              style={[
                styles.dot,
                {
                  backgroundColor: t.accent,
                  opacity: dots[i].opacity,
                  transform: [{ scale: dots[i].scale }],
                },
              ]}
            />
          ))}
        </View>

        <View style={[styles.buttons, isLarge && styles.buttonsStacked]}>
          {index > 0 && (
            <Pressable
              onPress={() => goTo(index - 1)}
              style={[styles.backButton, isLarge && styles.buttonStacked, { borderColor: t.border }]}>
              <Text style={[styles.backText, { color: t.sub }]}>Back</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => (last ? onDone() : goTo(index + 1))}
            style={[styles.nextButton, isLarge && styles.buttonStacked, { backgroundColor: t.accent }]}>
            <Text style={[styles.nextText, { color: t.accentInk }]}>
              {last ? 'Start stashing' : 'Next'}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
    // Above the home screen it covers, below the splash overlay in the
    // root layout, which is a sibling of the navigator rather than of
    // this.
    zIndex: 5,
    elevation: 5,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  stepCount: {
    fontFamily: Fonts.semiBold,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  skip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  skipText: {
    fontFamily: Fonts.semiBold,
    fontSize: 14,
  },
  page: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  // No lineHeight anywhere that scales — see the note on the home
  // screen's title.
  title: {
    fontFamily: Fonts.bold,
    fontSize: 24,
    marginTop: 26,
    marginBottom: 10,
    alignSelf: 'flex-start',
  },
  body: {
    fontFamily: Fonts.regular,
    fontSize: 15,
    alignSelf: 'flex-start',
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 16,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  buttons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  buttonsStacked: {
    flexDirection: 'column-reverse',
    alignItems: 'stretch',
  },
  buttonStacked: {
    flex: 0,
    width: '100%',
  },
  backButton: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 22,
    alignItems: 'center',
  },
  backText: {
    fontFamily: Fonts.semiBold,
    fontSize: 15,
  },
  nextButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  nextText: {
    fontFamily: Fonts.semiBold,
    fontSize: 15,
  },
});
