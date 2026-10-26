import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Screen } from '@/components/ui/Screen';
import { resultLabel } from '@/features/replays/format';
import { listReplays, type ReplaySummary } from '@/features/replays/repository';
import { formatDateTime } from '@/lib/text';
import { colors, radius, spacing } from '@/theme';

export default function ReplaysScreen() {
  const [replays, setReplays] = useState<ReplaySummary[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      listReplays()
        .then(setReplays)
        .catch(() => setReplays([]));
    }, [])
  );

  const wins = replays?.filter((r) => r.winner !== null && r.winner === r.viewer).length ?? 0;

  return (
    <Screen maxWidth={900}>
      {replays && replays.length > 0 ? (
        <AppText variant="muted">
          {replays.length} Duelle · {wins} Siege ({Math.round((wins / replays.length) * 100)} %). Jedes Replay enthält alle Aktionen und lässt sich exakt nachspielen; der
          Replay-Viewer und Statistiken folgen in Phase 6.
        </AppText>
      ) : null}
      {replays && replays.length === 0 ? <AppText variant="muted">Noch keine Duelle gespielt.</AppText> : null}
      <View style={styles.list}>
        {(replays ?? []).map((r) => {
          const result = resultLabel(r);
          return (
            <Pressable
              key={r.id}
              testID={`replay-${r.id}`}
              onPress={() => router.push({ pathname: '/replays/[id]', params: { id: r.id } })}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}>
              <Ionicons name={r.mode === 'puzzle' ? 'extension-puzzle-outline' : 'hardware-chip-outline'} size={24} color={colors.textMuted} />
              <View style={{ flex: 1 }}>
                <AppText style={{ fontWeight: '700' }} numberOfLines={1}>
                  {r.title}
                </AppText>
                <AppText variant="small" numberOfLines={1}>
                  {[formatDateTime(r.createdAt), `${r.turns} Züge`, r.aiLevel ? `KI Stufe ${r.aiLevel}` : null, r.reason].filter(Boolean).join(' · ')}
                </AppText>
              </View>
              <AppText style={{ color: result.color, fontWeight: '700' }}>{result.text}</AppText>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
});
