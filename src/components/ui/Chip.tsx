import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, font, radius, spacing } from '@/theme';

export function Chip({
  label,
  selected,
  onPress,
  color,
  testID,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  color?: string;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && { backgroundColor: color ?? colors.primary, borderColor: color ?? colors.primary },
        pressed && !selected && { backgroundColor: colors.surfaceRaised },
      ]}>
      <Text style={[styles.label, selected && styles.labelSelected]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  label: { color: colors.textMuted, fontSize: font.label, fontWeight: '600' },
  labelSelected: { color: colors.onPrimary },
});
