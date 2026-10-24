import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { colors, font, radius, spacing } from '@/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

type Props = {
  label: string;
  onPress?: () => void;
  icon?: IconName;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function Button({ label, onPress, icon, variant = 'secondary', size = 'md', disabled, loading, style, testID }: Props) {
  const fg = variant === 'primary' || variant === 'danger' ? colors.onPrimary : colors.text;
  const iconSize = size === 'sm' ? 15 : 18;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        styles[size],
        variantStyles[variant],
        pressed && pressedStyles[variant],
        (disabled || loading) && styles.disabled,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : icon ? (
        <Ionicons name={icon} size={iconSize} color={fg} />
      ) : null}
      <Text style={[styles.label, size === 'sm' && styles.labelSm, size === 'lg' && styles.labelLg, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  color = colors.text,
  size = 22,
  style,
  disabled,
  testID,
}: {
  icon: IconName;
  onPress?: () => void;
  label: string;
  color?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => [styles.iconButton, pressed && { backgroundColor: colors.surfaceRaised }, disabled && styles.disabled, style]}>
      <Ionicons name={icon} size={size} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
  },
  sm: { paddingHorizontal: spacing.md, paddingVertical: 6, minHeight: 32 },
  md: { paddingHorizontal: spacing.lg, paddingVertical: 10, minHeight: 42 },
  lg: { paddingHorizontal: spacing.xl, paddingVertical: 14, minHeight: 52 },
  label: { fontSize: font.body, fontWeight: '700' },
  labelSm: { fontSize: font.label },
  labelLg: { fontSize: 17 },
  disabled: { opacity: 0.45 },
  iconButton: { padding: 8, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});

const variantStyles = StyleSheet.create({
  primary: { backgroundColor: colors.primary, borderBottomWidth: 3, borderBottomColor: colors.primaryPressed },
  secondary: { backgroundColor: colors.surfaceRaised },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: colors.danger },
});

const pressedStyles = StyleSheet.create({
  primary: { backgroundColor: colors.primaryPressed },
  secondary: { backgroundColor: colors.border },
  ghost: { backgroundColor: colors.surfaceAlt },
  danger: { opacity: 0.85 },
});
