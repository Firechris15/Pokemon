import type { FrameType } from '@/features/cards/types';

/** Dark, Chess.com-inspired palette. */
export const colors = {
  bg: '#161512',
  surface: '#262421',
  surfaceAlt: '#302e2b',
  surfaceRaised: '#3a3733',
  border: '#45413c',
  text: '#f0eeeb',
  textMuted: '#a8a39c',
  textFaint: '#77726b',
  primary: '#81b64c',
  primaryPressed: '#6c9a3f',
  onPrimary: '#ffffff',
  accent: '#e0b44c',
  danger: '#e5534b',
  warning: '#f0a030',
  info: '#5aa7e0',
  backdrop: 'rgba(0,0,0,0.78)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
} as const;

export const font = {
  small: 12,
  body: 15,
  label: 13,
  title: 20,
  heading: 26,
  hero: 34,
} as const;

/** Card frame colours, used for placeholders and accents. */
export const frameColors: Record<FrameType, string> = {
  normal: '#c9a35a',
  effect: '#c0703a',
  ritual: '#5b7fc4',
  fusion: '#8a4fa3',
  synchro: '#d9d9d9',
  xyz: '#2b2b2b',
  link: '#1f5fa8',
  normal_pendulum: '#c9a35a',
  effect_pendulum: '#c0703a',
  ritual_pendulum: '#5b7fc4',
  fusion_pendulum: '#8a4fa3',
  synchro_pendulum: '#d9d9d9',
  xyz_pendulum: '#2b2b2b',
  spell: '#1d9e74',
  trap: '#bc4a8d',
  token: '#8a8a8a',
  skill: '#2a6fb0',
};

/** Real cards are 59 x 86 mm. */
export const CARD_ASPECT = 59 / 86;

/** Width above which the layout switches to side-by-side panes (iPad landscape). */
export const WIDE_BREAKPOINT = 900;
