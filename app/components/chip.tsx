import { Pressable, StyleSheet, Text } from 'react-native';

import { Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ChipProps = {
  label: string;
  active: boolean;
  onPress: () => void;
};

export function Chip({ label, active, onPress }: ChipProps) {
  const t = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          borderColor: active ? t.accent : t.border,
          backgroundColor: active ? t.accent : t.tile,
        },
      ]}>
      <Text
        style={{
          color: active ? t.accentInk : t.ink,
          fontFamily: active ? Fonts.semiBold : Fonts.regular,
          fontSize: 14,
        }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
});
