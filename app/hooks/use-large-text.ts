import { useEffect, useState } from 'react';
import { AppState, Dimensions } from 'react-native';

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
const LARGE_TEXT_THRESHOLD = 1.3;

export function useLargeText() {
  const [fontScale, setFontScale] = useState(() => Dimensions.get('window').fontScale);

  useEffect(() => {
    const read = () => {
      const next = Dimensions.get('window').fontScale;
      // Guarded so a foreground with no change doesn't re-render the tree.
      setFontScale((current) => (current === next ? current : next));
    };

    // useWindowDimensions() alone isn't enough here. Dimensions' change
    // event is driven by window *size*, and on iOS adjusting Dynamic Type
    // sends a trait-collection change that doesn't reliably surface as
    // one — so the value goes stale and only some of the tree re-renders
    // when something unrelated (a theme toggle, a navigation) forces it.
    // The result is a screen mixing both scales at once.
    //
    // Changing text size always means leaving the app and coming back, so
    // re-reading on foreground catches every real case.
    const dimensionsSub = Dimensions.addEventListener('change', read);
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') read();
    });

    read();

    return () => {
      dimensionsSub.remove();
      appStateSub.remove();
    };
  }, []);

  return {
    fontScale,
    // Stack what was side by side, and drop the grid to one column.
    isLarge: fontScale >= LARGE_TEXT_THRESHOLD,
  };
}
