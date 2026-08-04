import { useWindowDimensions } from 'react-native';

// Layout responds to text size the same way it would respond to screen
// width — one layout that rearranges, not a separate "accessibility mode".
// A forked layout doubles the surface that every future change has to be
// built and tested against, and the fork inevitably gets the less careful
// half of the attention. It also says "here is the lesser version for
// people who need large text", which is the wrong thing to say to the
// audience most likely to need it.
//
// fontScale is 1 at the default setting, tops out around 1.35 across the
// standard sizes, and keeps going to roughly 3.1 once "Larger
// Accessibility Sizes" is switched on.
//
// 1.3 is where two columns stop working: a room tile is 48% of the screen
// minus padding, and past that point names like "Living Room" can't fit on
// one line at any sensible size. Below it, everything already fits.
export function useLargeText() {
  const { fontScale } = useWindowDimensions();
  return {
    fontScale,
    // Stack what was side by side, and drop the grid to one column.
    isLarge: fontScale >= 1.3,
  };
}
