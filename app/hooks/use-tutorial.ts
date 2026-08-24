import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

// Set the moment a household is created or joined — the end of setting up
// a new account — and cleared once the walkthrough has been dismissed.
//
// Its own key rather than a field inside `stasher:data`, which
// clearLocalData() wipes when someone leaves a household or deletes their
// account. Those need to leave this alone in both directions.
const PENDING_KEY = 'stasher:tutorial-pending';

/**
 * Arms the walkthrough for the next time the home screen mounts.
 *
 * Called at the end of household setup, not on first launch. The
 * distinction is the whole point: the first version tracked whether *this
 * device* had ever shown the walkthrough, so reinstalling or signing in on
 * a second phone produced it again for someone who has used the app for
 * months. Finishing setup is the one moment that actually means new.
 *
 * Must be awaited before the household guard flips — the home screen reads
 * this as it mounts, and a write still in flight reads as absent.
 */
export async function armTutorial() {
  try {
    await AsyncStorage.setItem(PENDING_KEY, '1');
  } catch {
    // Worst case the walkthrough doesn't open by itself. It is still
    // reachable from the household sheet, and failing to store a hint is
    // not worth interrupting someone's first minute over.
  }
}

/**
 * There is deliberately no permanent "already seen this" record.
 *
 * One would stop the single case where setup runs for someone who isn't
 * new — leaving a household and then joining another — and it would cost
 * more than it saves: a stale flag on a phone would silently suppress the
 * walkthrough for a genuinely new account, which is the case that matters,
 * and it is invisible and untestable without wiping the app. Replaying six
 * skippable slides at a re-joiner is the cheaper mistake.
 */
export function useTutorial() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(PENDING_KEY)
      .then((pending) => {
        if (!cancelled && pending) setVisible(true);
      })
      .catch(() => {
        // As above: no walkthrough rather than an error in someone's face.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    // Cleared on dismissal rather than on open, so a crash or a force quit
    // part-way through leaves it to be offered again.
    AsyncStorage.removeItem(PENDING_KEY).catch(() => {});
  }, []);

  const replay = useCallback(() => setVisible(true), []);

  return { visible, dismiss, replay };
}
