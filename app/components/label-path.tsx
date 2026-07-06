import { StyleSheet, Text, View } from 'react-native';

import { Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type LabelPathProps = {
  parts: (string | null | undefined)[];
  size?: 'sm' | 'md';
};

export function LabelPath({ parts, size = 'sm' }: LabelPathProps) {
  const t = useTheme();
  const segs = parts.filter((p): p is string => Boolean(p));
  if (!segs.length) return null;

  const fontSize = size === 'sm' ? 10.5 : 12.5;
  const paddingVertical = size === 'sm' ? 2 : 4;
  const paddingHorizontal = size === 'sm' ? 7 : 10;

  return (
    <View style={styles.row}>
      {segs.map((s, i) => (
        <View key={i} style={styles.segment}>
          <Text
            style={{
              backgroundColor: t.accentSoft,
              color: t.accent,
              fontFamily: Fonts.semiBold,
              fontSize,
              letterSpacing: fontSize * 0.05,
              textTransform: 'uppercase',
              paddingVertical,
              paddingHorizontal,
              borderRadius: 5,
            }}>
            {s}
          </Text>
          {i < segs.length - 1 && (
            <Text style={{ color: t.sub, fontSize, fontFamily: Fonts.regular }}>›</Text>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
