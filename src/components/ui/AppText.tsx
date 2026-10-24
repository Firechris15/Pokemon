import { StyleSheet, Text, type TextProps } from 'react-native';

import { colors, font } from '@/theme';

type Variant = 'hero' | 'heading' | 'title' | 'body' | 'label' | 'muted' | 'small';

export function AppText({ variant = 'body', style, ...props }: TextProps & { variant?: Variant }) {
  return <Text {...props} style={[styles.base, styles[variant], style]} />;
}

const styles = StyleSheet.create({
  base: { color: colors.text, fontSize: font.body },
  hero: { fontSize: font.hero, fontWeight: '800', letterSpacing: -0.5 },
  heading: { fontSize: font.heading, fontWeight: '700' },
  title: { fontSize: font.title, fontWeight: '700' },
  body: { fontSize: font.body, lineHeight: 21 },
  label: { fontSize: font.label, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
  muted: { fontSize: font.body, color: colors.textMuted, lineHeight: 21 },
  small: { fontSize: font.small, color: colors.textMuted },
});
