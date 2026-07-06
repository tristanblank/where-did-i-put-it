import { Colors } from '@/constants/theme';
import { useItemsStore } from '@/lib/items-store';

export function useTheme() {
  const { theme } = useItemsStore();
  return Colors[theme];
}
