import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing } from '@/theme';

/** Page container: dark background, readable max width, optional scrolling. */
export function Screen({
  children,
  scroll = true,
  maxWidth = 1200,
  style,
  safeTop = false,
}: {
  children: ReactNode;
  scroll?: boolean;
  maxWidth?: number;
  style?: StyleProp<ViewStyle>;
  /** Pad for the status bar when the screen has no navigation header. */
  safeTop?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const padding = {
    paddingTop: (safeTop ? insets.top : 0) + spacing.lg,
    paddingBottom: insets.bottom + spacing.xl,
    paddingLeft: Math.max(insets.left, spacing.lg),
    paddingRight: Math.max(insets.right, spacing.lg),
  };
  const inner = <View style={[styles.inner, { maxWidth }, style]}>{children}</View>;
  if (!scroll) return <View style={[styles.root, padding]}>{inner}</View>;
  return (
    <ScrollView style={styles.root} contentContainerStyle={[styles.content, padding]} keyboardShouldPersistTaps="handled">
      {inner}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, alignItems: 'center' },
  inner: { width: '100%', flex: 1, gap: spacing.lg, alignSelf: 'center' },
});
