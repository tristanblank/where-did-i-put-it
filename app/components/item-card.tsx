import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LabelPath } from '@/components/label-path';
import { Fonts } from '@/constants/theme';
import { baseTileStyle } from '@/constants/tile-style';
import { useTheme } from '@/hooks/use-theme';
import { useItemsStore, type Item } from '@/lib/items-store';

type ItemCardProps = {
  item: Item;
  onPress: () => void;
};

export function ItemCard({ item, onPress }: ItemCardProps) {
  const t = useTheme();
  const { theme } = useItemsStore();

  return (
    <Pressable onPress={onPress} style={[baseTileStyle(t, theme), styles.container]}>
      <View style={styles.headerRow}>
        <Text style={[styles.name, { color: t.ink }]}>{item.name}</Text>
        <Text style={[styles.date, { color: t.sub }]}>
          {new Date(item.updatedAt).toLocaleDateString()}
        </Text>
      </View>
      <LabelPath parts={[item.room, item.spot, item.pos, item.container]} />
      {item.note ? <Text style={[styles.note, { color: t.sub }]}>{item.note}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 6,
  },
  name: {
    fontFamily: Fonts.semiBold,
    fontSize: 15.5,
    flexShrink: 1,
  },
  date: {
    fontFamily: Fonts.regular,
    fontSize: 10,
  },
  note: {
    marginTop: 6,
    fontFamily: Fonts.regular,
    fontSize: 14,
  },
});
