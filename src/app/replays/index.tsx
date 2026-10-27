import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { OverallStatsView } from '@/components/replays/OverallStatsView';
import { AppText } from '@/components/ui/AppText';
import { Chip } from '@/components/ui/Chip';
import { Screen } from '@/components/ui/Screen';
import { resultLabel } from '@/features/replays/format';
import { listReplays, type ReplayListItem } from '@/features/replays/repository';
import { overallStats } from '@/features/replays/stats';
import { formatDateTime } from '@/lib/text';
import { colors, radius, spacing } from '@/theme';

/** Analyse: statistics over all duels and the list of replays. */
export default function ReplaysScreen() {
  const [replays, setReplays] = useState<ReplayListItem[] | null>(null);
  const [tab, setTab] = useState<'stats' | 'list'>('stats');

  useFocusEffect(
    useCallback(() => {
      listReplays()
        .then(setReplays)
        .catch(() => setReplays([]));
    }, [])
  );

  const stats = useMemo(() => overallStats(replays ?? []), [replays]);

  return (
    <Screen maxWidth={900}>
      <View style={styles.tabs}>
        <Chip testID="tab-overall" label="Statistik" selected={tab === 'stats'} onPress={() => setTab('stats')} />
        <Chip testID="tab-replays" label={`Replays${replays ? ` (${replays.length})` : ''}`} selected={tab === 'list'} onPress={() => setTab('list')} />
      </View>
      {tab === 'stats' && replays ? <OverallStatsView stats={stats} /> : null}
      {tab === 'list' ? (
        <>
          {replays && replays.length === 0 ? <AppText variant="muted">Noch keine Duelle gespielt.</AppText> : null}
          {replays && replays.length > 0 ? (
            <AppText variant="muted">Antippen öffnet das Replay mit Spielfeld, Analyse und KI-Kommentar.</AppText>
          ) : null}
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
                      {[formatDateTime(r.createdAt), `${r.turns} Züge`, r.aiLevel ? `KI Stufe ${r.aiLevel}` : null, r.reason, r.analysed ? 'KI-Kommentar' : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </AppText>
                  </View>
                  <AppText style={{ color: result.color, fontWeight: '700' }}>{result.text}</AppText>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: spacing.sm },
  list: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
});
