import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';

import { DisplayFonts } from '@/constants/theme';

/**
 * The launch animation, from design/Stasher splash screen design.zip.
 *
 * The icon drops in and settles with a small overshoot, two rings expand
 * out through it, a ground shadow spreads underneath, the wordmark rises
 * letter by letter, a sheen sweeps across it, the tagline fades up and a
 * progress bar fills.
 *
 * The native splash is a plain brand-blue field with no image (see the
 * expo-splash-screen block in app.json), so the handoff to this is blue on
 * blue and there is nothing to see: the animation opens on an empty screen
 * because that's what it was drawn to do. Anything drawn natively would
 * have to be un-drawn here before the icon could fall into place.
 */

// The artboard's background, and the accent the app is built on.
const SPLASH_BG = '#2547D0';

// Design timings, in ms. Scaled by TIMELINE below.
const ICON_DELAY = 100;
const ICON_MS = 1050;
const RING_MS = 1500;
const RING_1_DELAY = 350;
const RING_2_DELAY = 620;
const LETTER_MS = 700;
const LETTER_DELAY = 780;
const LETTER_STAGGER = 50;
const SHEEN_MS = 1100;
const SHEEN_DELAY = 1350;
const TAGLINE_MS = 800;
const TAGLINE_DELAY = 1220;
const BAR_MS = 1900;
const BAR_DELAY = 1300;
const FOOTER_MS = 800;
const FOOTER_DELAY = 1700;

// Not scaled with the rest, and not from the artboard: this is the
// crossfade into the app, not a beat of the animation. It wants to stay a
// comfortable length however fast the sequence in front of it runs.
const FADE_MS = 380;

// The artboard was re-cut shorter, with every duration and delay in it
// divided by two — so this is that revision, expressed as the halving it
// actually is rather than by rewriting sixteen constants. The sequence
// ends when the progress bar does, now at 1.6 seconds rather than 3.2.
//
// (Three of the design's shortened values are rounded to the nearest
// 10ms where the exact half wasn't — .18s for .175, .31s for .31, .68s
// for .675. Under a third of a frame at 60fps, so they are left exact
// here.)
const TIMELINE = 0.5;
const ms = (v: number) => v * TIMELINE;

const WORDMARK = 'Stasher'.split('');

// Straight from the artboard: a 208pt icon inside a 236pt ring box.
const ICON_SIZE = 208;
const RING_SIZE = 236;

type AnimatedSplashProps = {
  /** Called once the overlay has faded out and can be unmounted. */
  onFinish: () => void;
};

export function AnimatedSplash({ onFinish }: AnimatedSplashProps) {
  // One driver per independent element. All of them animate opacity and
  // transform only, so the whole sequence runs on the UI thread while the
  // JS thread is busy with the app's first render underneath.
  const icon = useRef(new Animated.Value(0)).current;
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const shadow = useRef(new Animated.Value(0)).current;
  const letters = useRef(WORDMARK.map(() => new Animated.Value(0))).current;
  const sheen = useRef(new Animated.Value(0)).current;
  const tagline = useRef(new Animated.Value(0)).current;
  const bar = useRef(new Animated.Value(0)).current;
  const footer = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;

  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!cancelled) setReduceMotion(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Wait for the reduce-motion answer before starting, so the first
    // frames aren't animated and then corrected mid-flight.
    if (reduceMotion === null) return;

    const timed = (value: Animated.Value, duration: number, delay: number, easing = Easing.out(Easing.cubic)) =>
      Animated.timing(value, { toValue: 1, duration, delay, easing, useNativeDriver: true });

    let sequence: Animated.CompositeAnimation;

    if (reduceMotion) {
      // Everything arrives at once, by fading. Reduce Motion is a request
      // about movement, not about being dropped straight onto the home
      // screen — the crossfade out is the part that still earns its place.
      sequence = Animated.sequence([
        Animated.parallel(
          [icon, shadow, ...letters, tagline, footer].map((v) =>
            Animated.timing(v, { toValue: 1, duration: ms(400), useNativeDriver: true })
          )
        ),
        Animated.timing(bar, { toValue: 1, duration: ms(700), useNativeDriver: true }),
        Animated.timing(fade, { toValue: 0, duration: FADE_MS, useNativeDriver: true }),
      ]);
    } else {
      sequence = Animated.sequence([
        Animated.parallel([
          // cubic-bezier(.2,.9,.3,1.05) — the overshoot lives in the
          // keyframes below rather than in the easing curve, because
          // Animated interpolates a single 0→1 driver and multi-stop
          // keyframes are expressed as interpolation ranges.
          timed(icon, ms(ICON_MS), ms(ICON_DELAY), Easing.bezier(0.2, 0.9, 0.3, 1)),
          timed(shadow, ms(ICON_MS), ms(ICON_DELAY), Easing.bezier(0.2, 0.9, 0.3, 1)),
          timed(ring1, ms(RING_MS), ms(RING_1_DELAY), Easing.bezier(0.16, 0.84, 0.44, 1)),
          timed(ring2, ms(RING_MS), ms(RING_2_DELAY), Easing.bezier(0.16, 0.84, 0.44, 1)),
          ...letters.map((v, i) =>
            timed(v, ms(LETTER_MS), ms(LETTER_DELAY + i * LETTER_STAGGER), Easing.bezier(0.2, 0.8, 0.3, 1))
          ),
          timed(sheen, ms(SHEEN_MS), ms(SHEEN_DELAY), Easing.bezier(0.4, 0, 0.2, 1)),
          timed(tagline, ms(TAGLINE_MS), ms(TAGLINE_DELAY), Easing.bezier(0.2, 0.8, 0.3, 1)),
          timed(bar, ms(BAR_MS), ms(BAR_DELAY), Easing.bezier(0.5, 0, 0.2, 1)),
          timed(footer, ms(FOOTER_MS), ms(FOOTER_DELAY), Easing.ease),
        ]),
        Animated.timing(fade, {
          toValue: 0,
          duration: FADE_MS,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]);
    }

    sequence.start(({ finished }) => {
      if (finished) onFinish();
    });

    return () => sequence.stop();
    // onFinish is a setState updater from the layout; re-running this on
    // an identity change would restart the splash mid-fade.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);

  // Hiding on layout rather than on mount, because mount runs before this
  // view has been measured and placed. Hiding the native splash at that
  // point uncovers the home screen for however long it takes this to
  // appear over it — a gap iOS's own fade would mostly paper over and
  // Android, which cuts, would not.
  const handleLayout = () => {
    SplashScreen.hideAsync().catch(() => {
      // Already hidden, or the module isn't there (web). Either way the
      // overlay is up and the animation carries on regardless.
    });
  };

  return (
    <Animated.View
      onLayout={handleLayout}
      // Swallows touches rather than passing them through. The home screen
      // is fully mounted and interactive underneath this, so letting taps
      // through would mean a tap on a splash landing on whatever tile
      // happens to be behind it.
      pointerEvents="auto"
      style={[styles.fill, { backgroundColor: SPLASH_BG, opacity: fade }]}>
      {/* The splash is brand blue whatever the app's theme is, so the
          status bar wants light content either way — the app's own themed
          StatusBar takes back over as soon as this unmounts. */}
      <StatusBar style="light" />

      <Image
        source={require('../assets/images/splash-glow.png')}
        style={StyleSheet.absoluteFill}
        contentFit="fill"
        transition={0}
        pointerEvents="none"
      />

      <View style={styles.stack}>
        <View style={styles.iconBox}>
          {[ring1, ring2].map((ring, i) => (
            <Animated.View
              key={i}
              style={[
                styles.ring,
                {
                  // 0 → .5 by 22% of the way through, then out to nothing.
                  opacity: ring.interpolate({
                    inputRange: [0, 0.22, 1],
                    outputRange: [0, 0.5, 0],
                  }),
                  transform: [
                    { scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.9] }) },
                  ],
                  borderColor: i === 0 ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.7)',
                },
              ]}
            />
          ))}

          <Animated.Image
            source={require('../assets/images/splash-icon.png')}
            style={[
              styles.icon,
              {
                opacity: icon.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0, 1, 1] }),
                transform: [
                  {
                    // The drop, with the settle: down past the mark, back
                    // up, then home.
                    translateY: icon.interpolate({
                      inputRange: [0, 0.55, 0.75, 1],
                      outputRange: [-46, 6, -3, 0],
                    }),
                  },
                  {
                    scale: icon.interpolate({
                      inputRange: [0, 0.55, 0.75, 1],
                      outputRange: [0.86, 1.03, 0.995, 1],
                    }),
                  },
                ],
              },
            ]}
          />
        </View>

        <Animated.View
          style={[
            styles.shadow,
            {
              opacity: shadow.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 0.38, 0.22] }),
              transform: [
                { scaleX: shadow.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.4, 1.06, 1] }) },
              ],
            },
          ]}>
          <Image
            source={require('../assets/images/splash-shadow.png')}
            style={StyleSheet.absoluteFill}
            contentFit="fill"
            transition={0}
          />
        </Animated.View>

        <View style={styles.wordmarkClip}>
          <View style={styles.wordmarkRow}>
            {WORDMARK.map((letter, i) => (
              <Animated.Text
                key={i}
                allowFontScaling={false}
                style={[
                  styles.wordmark,
                  {
                    opacity: letters[i],
                    transform: [
                      { translateY: letters[i].interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
                    ],
                  },
                ]}>
                {letter}
              </Animated.Text>
            ))}
          </View>

          {/* Swept across the wordmark's own clip box. The design blends
              this with `overlay`, which React Native has no equivalent
              for; over white letters on a solid blue field, a plain
              translucent white sheen lands in almost the same place. */}
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              {
                transform: [
                  {
                    translateX: sheen.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-SHEEN_TRAVEL, SHEEN_TRAVEL],
                    }),
                  },
                ],
              },
            ]}>
            <Image
              source={require('../assets/images/splash-sheen.png')}
              style={StyleSheet.absoluteFill}
              contentFit="fill"
              transition={0}
            />
          </Animated.View>
        </View>

        <Animated.Text
          allowFontScaling={false}
          style={[
            styles.tagline,
            {
              opacity: tagline,
              transform: [
                { translateY: tagline.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
              ],
            },
          ]}>
          Everything, in its place
        </Animated.Text>

        <View style={styles.barTrack}>
          <Animated.View
            style={[
              styles.barFill,
              { transform: [{ scaleX: bar }] },
            ]}
          />
        </View>
      </View>

      <Animated.Text
        allowFontScaling={false}
        style={[
          styles.footer,
          {
            opacity: footer,
            transform: [
              { translateY: footer.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
            ],
          },
        ]}>
        Home inventory
      </Animated.Text>
    </Animated.View>
  );
}

// How far the sheen travels either side of the wordmark. The design moves
// it from -100% to +100% of its own box; the box here is the wordmark's
// clip, so this is that width with room to spare on a wide phone.
const SHEEN_TRAVEL = 320;

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    // Sits above the navigator on both platforms. Ordering alone is
    // enough on iOS; Android needs the elevation to match.
    zIndex: 10,
    elevation: 10,
  },
  stack: {
    alignItems: 'center',
  },
  iconBox: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 1.5,
  },
  icon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    // The icon art is baked onto its own brand-blue square. On a
    // brand-blue field the square is invisible and only the artwork
    // reads, so this radius is doing nothing visible today — it is here
    // because the design has it, and it starts mattering the moment the
    // background stops matching the icon.
    borderRadius: 46,
  },
  // Sized to the generated PNG, which is the 150x12 ellipse plus the
  // padding its blur needs to fade out in — so the visible shadow is
  // still the design's 150 wide.
  shadow: {
    width: 200,
    height: 62,
    marginTop: -11,
  },
  wordmarkClip: {
    // 34 in the design, measured from the bottom of a 12pt shadow. The
    // shadow here is a 62pt image with the blur's falloff padded around
    // that ellipse, so it hangs 25pt lower in the flow and this gives the
    // 25 back. Net effect: the wordmark sits exactly where it was drawn.
    marginTop: 9,
    paddingHorizontal: 6,
    overflow: 'hidden',
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  wordmark: {
    fontFamily: DisplayFonts.semiBold,
    fontSize: 62,
    color: '#FFFFFF',
    letterSpacing: -2.17,
  },
  tagline: {
    marginTop: 16,
    fontFamily: DisplayFonts.regular,
    fontSize: 15,
    letterSpacing: 3.9,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.72)',
  },
  barTrack: {
    marginTop: 58,
    width: 92,
    height: 2,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.22)',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    height: '100%',
    backgroundColor: '#FFFFFF',
    // Grows from the left rather than from the middle.
    transformOrigin: 'left',
  },
  footer: {
    position: 'absolute',
    bottom: 34,
    fontFamily: DisplayFonts.regular,
    fontSize: 12,
    letterSpacing: 1.44,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.42)',
  },
});
