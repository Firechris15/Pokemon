import { StyleSheet, Text, View } from 'react-native';

import { formatPercent, Meter } from '@/components/handtrainer/charts';
import { winRate, type Group, type Outcome, type OverallStats } from '@/features/replays/stats';
import { colors, radius, spacing } from '@/theme';

const OUTCOME: Record<Outcome, { letter: string; color: string; label: string }> = {
  W: { letter: 'S', color: colors.primary, label: 'Sieg' },
  L: { letter: 'N', color: colors.danger, label: 'Niederlage' },
  D: { letter: 'U', color: colors.surfaceRaised, label: 'Unentschieden' },
};

/** Win rate and key figures over all duels against the AI. */
export function OverallStatsView({ stats }: { stats: OverallStats }) {
  if (stats.games === 0) {
    return <Text style={styles.muted}>Noch keine Duelle gegen die KI – spiele ein Duell, dann erscheint hier deine Statistik.</Text>;
  }
  const rate = winRate(stats);
  return (
    <View style={styles.root} testID="overall-stats">
      <View style={styles.tiles}>
        <Tile label="Duelle" value={String(stats.games)} />
        <Tile label="Siegquote" value={formatPercent(rate)} testID="overall-winrate" />
        <Tile label="Bilanz" value={`${stats.wins} S · ${stats.losses} N${stats.draws ? ` · ${stats.draws} U` : ''}`} />
        <Tile label="Ø Züge" value={stats.avgTurns.toFixed(1).replace('.', ',')} />
        <Tile label="Ø Schaden" value={`${Math.round(stats.avgDamageDealt)} zugefügt · ${Math.round(stats.avgDamageTaken)} erhalten`} />
        {stats.streak ? <Tile label="Serie" value={`${stats.streak.count} ${stats.streak.count === 1 ? OUTCOME[stats.streak.outcome].label : plural(stats.streak.outcome)} in Folge`} /> : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.title}>Letzte Duelle</Text>
        <View style={styles.strip} accessibilityLabel={`Letzte Duelle, älteste zuerst: ${stats.recent.map((o) => OUTCOME[o].label).join(', ')}`}>
          {stats.recent.map((o, i) => (
            <View key={i} style={[styles.result, { backgroundColor: OUTCOME[o].color }]}>
              <Text style={styles.resultText}>{OUTCOME[o].letter}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.muted}>Älteste links, neueste rechts · S = Sieg, N = Niederlage, U = Unentschieden</Text>
      </View>

      <GroupTable title="Nach deinem Deck" groups={stats.byDeck} />
      <GroupTable title="Nach Deck der KI" groups={stats.byOpponent} />
      <GroupTable title="Nach KI-Stufe" groups={stats.byLevel} />
      <GroupTable title="Wer beginnt" groups={stats.byStart} />

      {stats.reasons.length ? (
        <View style={styles.section}>
          <Text style={styles.title}>Wie die Duelle endeten</Text>
          {stats.reasons.map((r) => (
            <View key={r.reason} style={styles.reasonRow}>
              <Text style={styles.reason}>{r.reason}</Text>
              <Text style={styles.value}>
                {r.wins} S · {r.losses} N
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const plural = (o: Outcome) => (o === 'W' ? 'Siege' : o === 'L' ? 'Niederlagen' : 'Unentschieden');

function Tile({ label, value, testID }: { label: string; value: string; testID?: string }) {
  return (
    <View style={styles.tile} testID={testID}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileValue}>{value}</Text>
    </View>
  );
}

function GroupTable({ title, groups }: { title: string; groups: Group[] }) {
  if (groups.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.title}>{title}</Text>
      {groups.map((g) => {
        const rate = winRate(g) ?? 0;
        return (
          <View key={g.key} style={styles.group}>
            <View style={styles.groupHead}>
              <Text style={styles.groupLabel} numberOfLines={1}>
                {g.label}
              </Text>
              <Text style={styles.value}>
                {formatPercent(rate)} · {g.wins}–{g.losses}
                {g.draws ? `–${g.draws}` : ''} ({g.games})
              </Text>
            </View>
            <Meter value={rate} />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.lg },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { backgroundColor: colors.surface, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, gap: 2, flexGrow: 1, minWidth: 130 },
  tileLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  tileValue: { color: colors.text, fontSize: 18, fontWeight: '700' },
  section: { gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
  title: { color: colors.text, fontWeight: '700', fontSize: 14 },
  muted: { color: colors.textMuted, fontSize: 12 },
  strip: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  result: { width: 24, height: 24, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  resultText: { color: colors.onPrimary, fontWeight: '700', fontSize: 12 },
  group: { gap: 4 },
  groupHead: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  groupLabel: { color: colors.text, fontSize: 13, flex: 1 },
  value: { color: colors.textMuted, fontSize: 12, fontVariant: ['tabular-nums'] },
  reasonRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  reason: { color: colors.text, fontSize: 13, flex: 1 },
});
