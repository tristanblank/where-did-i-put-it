import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import {
  PART_RADIUS,
  renderPart,
  renderScreen,
  type PartKey,
  type Rect,
  type Scheme,
  type ScreenKey,
  type Tokens,
} from '@/components/tutorial-screens';

type SpotlightProps = {
  screen: ScreenKey;
  /** null shows the screen plain, with nothing dimmed — an establishing shot. */
  target: PartKey | null;
  width: number;
  height: number;
  t: Tokens;
  theme: Scheme;
};

const DIM = 'rgba(8,10,14,0.68)';

// Breathing room kept below the target when the screen has to be panned
// to bring it into the frame.
const PAN_MARGIN = 24;

// There was a magnified copy of the target under the spotlight for a
// while. It was cut: once the element is the only bright thing on a dimmed
// screen, showing it a second time larger says nothing the ring hasn't
// already said, and on the wider targets the enlarged copy covered the
// context that made the slide legible.

/**
 * A screen with one element lifted out of it.
 *
 * The dimming is a single full-frame scrim with an un-dimmed *copy* of the
 * target drawn on top, rather than four rectangles fenced around a hole.
 * A hole is rectangular, so a tile's rounded corners would leak four
 * bright triangles; drawing the part again clips to its real shape for
 * free, and it costs nothing because the parts are already functions that
 * can be called more than once.
 */
export function Spotlight({ screen, target, width, height, t, theme }: SpotlightProps) {
  const [rect, setRect] = useState<Rect | null>(null);
  const pulse = useRef(new Animated.Value(0)).current;

  // The measured rect belongs to whichever part is being highlighted, so
  // it has to be dropped when the slide changes — otherwise the ring
  // spends a frame around the previous slide's element, in the wrong
  // place on a screen that may not even contain it.
  useEffect(() => {
    setRect(null);
  }, [screen, target]);

  useEffect(() => {
    if (!rect) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [rect, pulse]);

  const onRect = (next: Rect) => {
    setRect((current) =>
      current &&
      current.x === next.x &&
      current.y === next.y &&
      current.width === next.width &&
      current.height === next.height
        ? current
        : next
    );
  };

  // Pan only as far as it takes to get the target inside the frame, and
  // never down. Parking every target at the top instead would be simpler
  // and would throw away the thing these slides are for: the first cut
  // did that, and it slid the header and the search field off the top, so
  // what was left read as a crop of some tiles rather than as the home
  // screen. Most targets need no pan at all.
  const overshoot = rect ? rect.y + rect.height - (height - PAN_MARGIN) : 0;
  const offset = -Math.max(0, overshoot);
  const targetTop = rect ? rect.y + offset : 0;

  const radius = target ? PART_RADIUS[target] : 0;

  return (
    <View
      style={[
        styles.frame,
        { width, height, backgroundColor: t.bg, borderColor: t.border },
      ]}>
      <View style={{ transform: [{ translateY: offset }] }}>
        {renderScreen(screen, { target, onRect, t, theme })}
      </View>

      {target && rect ? (
        <>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: DIM }]} pointerEvents="none" />

          {/* The same element again, at the same size and place, above the
              scrim — so it is the only thing on the screen at full
              brightness. */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: rect.x,
              top: targetTop,
              width: rect.width,
              height: rect.height,
            }}>
            {renderPart(target, t, theme)}
          </View>

          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: rect.x - 5,
              top: targetTop - 5,
              width: rect.width + 10,
              height: rect.height + 10,
              borderRadius: radius + 5,
              borderWidth: 2.5,
              borderColor: t.accent,
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }),
              transform: [
                { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.99, 1.03] }) },
              ],
            }}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderWidth: 1,
    borderRadius: 24,
    // Everything past the frame is cut away, which is what makes a
    // full-length screen readable in a third of one.
    overflow: 'hidden',
  },
});
