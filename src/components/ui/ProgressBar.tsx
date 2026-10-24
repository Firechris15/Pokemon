import { StyleSheet, View } from 'react-native';

import { colors, radius } from '@/theme';

/** Determinate bar for 0..1, or an indeterminate full-width stripe for null. */
export function ProgressBar({ value, color = colors.primary }: { value: number | null; color?: string }) {
  const width = value === null ? '100%' : `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width, backgroundColor: color, opacity: value === null ? 0.4 : 1 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 8, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.sm },
});
