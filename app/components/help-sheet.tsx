import Constants from 'expo-constants';
import { Alert, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Fonts } from '@/constants/theme';
import { baseTileStyle } from '@/constants/tile-style';
import { useTheme } from '@/hooks/use-theme';
import { useItemsStore } from '@/lib/items-store';

// The address on the support page and in the App Store listing. Kept the
// same one deliberately — a second inbox is a second thing to remember to
// read.
const SUPPORT_EMAIL = 'stasherdotapp@gmail.com';

type HelpSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Closes this sheet and replays the walkthrough. */
  onShowTutorial: () => void;
};

export function HelpSheet({ visible, onClose, onShowTutorial }: HelpSheetProps) {
  const t = useTheme();
  const { theme } = useItemsStore();

  if (!visible) return null;

  // Opens the phone's mail app with the version details already in the
  // body, because "which build were you on?" is the first question every
  // bug report needs and the last thing anyone knows off-hand.
  //
  // Composed in their mail app rather than sent from inside the app: they
  // see exactly what goes, they can delete the diagnostic lines, and it
  // lands in a normal thread that can be replied to. No backend, no
  // collection of anything they didn't choose to write.
  const handleFeedback = async () => {
    const version = Constants.expoConfig?.version ?? 'unknown';
    const build =
      Constants.platform?.ios?.buildNumber ?? Constants.platform?.android?.versionCode ?? '?';

    const body = [
      '',
      '',
      '',
      '—',
      'These lines help track the problem down. Delete them if you would rather not send them.',
      `Stasher ${version} (build ${build})`,
      `${Platform.OS === 'ios' ? 'iOS' : 'Android'} ${Platform.Version}`,
    ].join('\n');

    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
      'Stasher feedback'
    )}&body=${encodeURIComponent(body)}`;

    try {
      await Linking.openURL(url);
      onClose();
    } catch {
      // No mail app configured, which is common enough on a phone that
      // uses webmail only. The address is the useful half of what this
      // was going to do anyway.
      Alert.alert(
        'No email app set up',
        `Send your feedback to ${SUPPORT_EMAIL} and it'll reach a real person.`
      );
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: t.tile, borderColor: t.border }]}>
        <ScrollView contentContainerStyle={styles.sheetContent} bounces={false}>
          <Text style={[styles.headerTitle, { color: t.ink }]}>Help &amp; feedback</Text>

          <Pressable
            onPress={onShowTutorial}
            style={[baseTileStyle(t, theme), styles.choiceTile]}>
            <Text style={[styles.choiceTitle, { color: t.ink }]}>Tutorial</Text>
            <Text style={[styles.choiceBody, { color: t.sub }]}>
              The six-screen tour again — adding something, moving it, rooms, invite codes and
              names.
            </Text>
          </Pressable>

          <Pressable
            onPress={handleFeedback}
            style={[baseTileStyle(t, theme), styles.choiceTile]}>
            <Text style={[styles.choiceTitle, { color: t.ink }]}>
              Submit feedback / report a bug
            </Text>
            <Text style={[styles.choiceBody, { color: t.sub }]}>
              Opens an email to {SUPPORT_EMAIL}, with your version details filled in.
            </Text>
          </Pressable>

          <Pressable style={[styles.cancelRow, { borderColor: t.border }]} onPress={onClose}>
            <Text style={[styles.cancelText, { color: t.sub }]}>Close</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopWidth: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    // Bottom-anchored, so content taller than the screen grows off the top
    // rather than clipping at the bottom. Capping it keeps the backdrop
    // tappable and lets the contents scroll instead.
    maxHeight: '88%',
  },
  sheetContent: {
    padding: 20,
    paddingBottom: 36,
  },
  headerTitle: {
    fontFamily: Fonts.bold,
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 4,
  },
  // The same shape as the two choices on the household setup screen, which
  // is the other place in the app that offers exactly two things to do.
  choiceTile: {
    marginTop: 16,
    padding: 16,
  },
  choiceTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: 16,
  },
  choiceBody: {
    marginTop: 4,
    fontFamily: Fonts.regular,
    fontSize: 13,
  },
  cancelRow: {
    marginTop: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  cancelText: {
    fontFamily: Fonts.semiBold,
    fontSize: 16,
  },
});
