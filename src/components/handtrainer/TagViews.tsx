import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TAG_COLORS, TAG_LABELS, type HandTag } from '@/features/handtrainer/tags';
import { colors, radius } from '@/theme';

/** Compact tag markers: coloured dot + name (identity never by colour alone). */
export function TagBadges({ tags, compact = false }: { tags: HandTag[]; compact?: boolean }) {
  if (tags.length === 0) return null;
  return (
    <View style={styles.badges}>
      {tags.map((tag) => (
        <View key={tag} style={[styles.badge, compact && styles.badgeCompact]}>
          <View style={[styles.dot, { backgroundColor: TAG_COLORS[tag] }]} />
          <Text style={[styles.badgeText, compact && { fontSize: 10 }]} numberOfLines={1}>
            {TAG_LABELS[tag]}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Toggle chip for one tag; filled with the tag colour when active. */
export function TagToggle({ tag, active, onPress, testID }: { tag: HandTag; active: boolean; onPress: () => void; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityState={{ checked: active }}
      accessibilityLabel={TAG_LABELS[tag]}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.toggle,
        active ? { backgroundColor: TAG_COLORS[tag], borderColor: TAG_COLORS[tag] } : null,
        pressed && { opacity: 0.75 },
      ]}>
      {!active ? <View style={[styles.dot, { backgroundColor: TAG_COLORS[tag] }]} /> : null}
      <Text style={[styles.toggleText, active && styles.toggleTextActive]}>{TAG_LABELS[tag]}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeCompact: { paddingHorizontal: 4, paddingVertical: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  badgeText: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: colors.surfaceAlt,
  },
  toggleText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  toggleTextActive: { color: '#ffffff' },
});
