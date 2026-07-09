export const DEFAULT_ROOMS: Record<string, string[]> = {
  Hallway: ['Closet', 'Console table', 'Coat rack'],
  Kitchen: ['Junk drawer', 'Pantry', 'Upper cabinets', 'Lower cabinets', 'Under sink'],
  'Living room': ['TV console', 'Bookshelf', 'Coffee table', 'Sideboard', 'Ottoman'],
  Bedroom: ['Dresser', 'Nightstand', 'Closet', 'Under bed'],
  Nursery: ['Dresser', 'Closet', 'Changing table', 'Toy bin'],
  Bathroom: ['Vanity', 'Medicine cabinet', 'Linen closet'],
  Office: ['Desk', 'Filing cabinet', 'Shelf'],
  Storage: ['Shelving unit', 'Bins', 'Overhead rack'],
};

export const ROOM_ICONS: Record<string, string> = {
  Hallway: '🚪',
  Kitchen: '🍳',
  'Living room': '🛋️',
  Bedroom: '🛏️',
  Nursery: '🧸',
  Bathroom: '🛁',
  Office: '🖥️',
  Storage: '📦',
};

export const ICON_CHOICES: string[] = [
  '🏠', '🚪', '🍳', '🛋️', '🛏️', '🧸', '🛁', '🖥️',
  '📦', '🧺', '🧰', '🚗', '🌿', '📚', '🎮', '🪑',
  '🚿', '🧴', '🧹', '🗄️',
];

export const POSITIONS: string[] = [
  'Top shelf',
  'Middle shelf',
  'Bottom shelf',
  'Top drawer',
  'Middle drawer',
  'Bottom drawer',
  'Left side',
  'Right side',
  'In the back',
  'Up front',
  'On top',
  'Underneath',
  'Hanging',
];
