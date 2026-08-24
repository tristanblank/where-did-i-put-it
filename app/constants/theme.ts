export const Colors = {
  light: {
    bg: '#F2F4F7',
    tile: '#FFFFFF',
    tileAlt: '#E9EDF2',
    ink: '#1B2029',
    sub: '#66707D',
    border: '#E3E7ED',
    accent: '#2547D0',
    accentInk: '#FFFFFF',
    accentSoft: '#E4EAFB',
    danger: '#C0392B',
  },
  dark: {
    bg: '#0F1115',
    tile: '#1A1D24',
    tileAlt: '#23262F',
    ink: '#F2F4F8',
    sub: '#8B93A1',
    border: '#2A2E38',
    accent: '#6E8BFF',
    accentInk: '#0F1115',
    accentSoft: '#232B47',
    danger: '#FF8A7A',
  },
} as const;

export const Fonts = {
  regular: 'EncodeSansSemiExpanded_400Regular',
  medium: 'EncodeSansSemiExpanded_500Medium',
  semiBold: 'EncodeSansSemiExpanded_600SemiBold',
  bold: 'EncodeSansSemiExpanded_700Bold',
  extraBold: 'EncodeSansSemiExpanded_800ExtraBold',
} as const;

// Outfit, from the splash artboard in design/. The launch animation is
// the only place it appears — the app itself is Encode Sans throughout,
// and mixing the two anywhere else would read as an accident rather than
// as a title card.
export const DisplayFonts = {
  regular: 'Outfit_400Regular',
  semiBold: 'Outfit_600SemiBold',
} as const;
