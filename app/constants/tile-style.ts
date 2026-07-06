import { Platform, type ViewStyle } from 'react-native';

import { Colors } from '@/constants/theme';

type ThemeTokens = Record<keyof typeof Colors.light, string>;

export function baseTileStyle(t: ThemeTokens, scheme: 'light' | 'dark'): ViewStyle {
  return {
    backgroundColor: t.tile,
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: 20,
    ...Platform.select<ViewStyle>({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: scheme === 'dark' ? 0.4 : 0.07,
        shadowRadius: 3,
      },
      android: {
        elevation: scheme === 'dark' ? 4 : 2,
      },
      default: {},
    }),
  };
}
