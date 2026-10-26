import { StyleSheet, Text, View } from 'react-native';

import type { BanStatus } from '@/features/cards/types';

const COLORS: Record<BanStatus, string> = {
  Forbidden: '#d93a3a',
  Limited: '#e57f22',
  'Semi-Limited': '#d8b21c',
};

const LABEL: Record<BanStatus, string> = { Forbidden: '0', Limited: '1', 'Semi-Limited': '2' };

/** Round banlist marker like on official decklists: 0 / 1 / 2. */
export function BanBadge({ status, size = 20 }: { status: BanStatus | null; size?: number }) {
  if (!status) return null;
  return (
    <View
      accessibilityLabel={`Banlist: ${status}`}
      style={[styles.badge, { width: size, height: size, borderRadius: size / 2, backgroundColor: COLORS[status] }]}>
      <Text style={[styles.text, { fontSize: size * 0.62 }]}>{LABEL[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#000' },
  text: { color: '#fff', fontWeight: '900' },
});
