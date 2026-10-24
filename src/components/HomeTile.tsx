import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import type { IconName } from '@/components/ui/Button';
import { colors, radius, spacing } from '@/theme';

/** Large Chess.com-style tile on the start page. */
export function HomeTile({
  title,
  subtitle,
  icon,
  color,
  onPress,
  badge,
  disabled,
  width,
  testID,
}: {
  title: string;
  subtitle: string;
  icon: IconName;
  color: string;
  onPress?: () => void;
  badge?: string;
  disabled?: boolean;
  width: number;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!disabled }}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [styles.tile, { width }, pressed && !disabled && styles.pressed, disabled && styles.disabled]}>
      <View style={[styles.iconWrap, { backgroundColor: `${color}22` }]}>
        <Ionicons name={icon} size={34} color={color} />
      </View>
      <View style={styles.text}>
        <AppText variant="title">{title}</AppText>
        <AppText variant="small" numberOfLines={2}>
          {subtitle}
        </AppText>
      </View>
      {badge ? (
        <View style={styles.badge}>
          <AppText style={styles.badgeText}>{badge}</AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    borderBottomWidth: 4,
    borderBottomColor: colors.surfaceAlt,
    minHeight: 150,
  },
  pressed: { backgroundColor: colors.surfaceAlt, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.5 },
  iconWrap: { width: 58, height: 58, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  text: { gap: 4 },
  badge: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
});
