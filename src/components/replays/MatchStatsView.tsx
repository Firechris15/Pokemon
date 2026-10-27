import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { openCardDetail } from '@/features/cards/detailStore';
import type { MatchStats, SideStats } from '@/features/replays/stats';
import { colors, radius, spacing } from '@/theme';

import { LpChart } from './LpChart';

const ROWS: { key: keyof SideStats; label: string }[] = [
  { key: 'damageDealt', label: 'Schaden zugefügt' },
  { key: 'attacks', label: 'Angriffe' },
  { key: 'summons', label: 'Normalbeschwörungen' },
  { key: 'specialSummons', label: 'Spezialbeschwörungen' },
  { key: 'sets', label: 'Karten gesetzt' },
  { key: 'activations', label: 'Effekte aktiviert' },
  { key: 'negated', label: 'davon annulliert' },
  { key: 'drawn', label: 'Karten gezogen' },
  { key: 'lpPaid', label: 'LP bezahlt' },
  { key: 'recovered', label: 'LP erhalten' },
];

/** Key figures of one duel: LP over the turns and what each player did. */
export function MatchStatsView({ stats, nameOf, onTurnPress }: { stats: MatchStats; nameOf: (code: number) => string; onTurnPress?: (turn: number) => void }) {
  const [width, setWidth] = useState(0);
  return (
    <View style={styles.root} testID="match-stats">
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>{width > 0 ? <LpChart data={stats.lpByTurn} width={width} onTurnPress={onTurnPress} /> : null}</View>
      <View style={styles.facts}>
        <Fact label="Begonnen" value={stats.firstPlayer === 'me' ? 'Du' : stats.firstPlayer === 'opp' ? 'Gegner' : '–'} />
        <Fact label="Züge" value={String(stats.turns)} />
        <Fact
          label="Größter Treffer"
          value={stats.biggestHit ? `${stats.biggestHit.amount} (Zug ${stats.biggestHit.turn}, ${stats.biggestHit.toMe ? 'an dich' : 'an Gegner'})` : '–'}
        />
      </View>
      <View style={styles.table}>
        <View style={styles.row}>
          <Text style={[styles.label, styles.head]} />
          <Text style={[styles.value, styles.head]}>Du</Text>
          <Text style={[styles.value, styles.head]}>Gegner</Text>
        </View>
        {ROWS.map((r) => (
          <View key={r.key} style={styles.row}>
            <Text style={styles.label}>{r.label}</Text>
            <Text style={styles.value}>{stats.me[r.key]}</Text>
            <Text style={styles.value}>{stats.opp[r.key]}</Text>
          </View>
        ))}
      </View>
      {stats.topCards.length ? (
        <View style={styles.top}>
          <Text style={styles.title}>Deine meistgenutzten Karten</Text>
          {stats.topCards.map((c) => (
            <Pressable key={c.code} onPress={() => openCardDetail(c.code)} style={styles.topRow}>
              <Text style={styles.topName} numberOfLines={1}>
                {nameOf(c.code)}
              </Text>
              <Text style={styles.topCount}>{c.count}×</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.lg },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  fact: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, gap: 2, flexGrow: 1 },
  factLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  factValue: { color: colors.text, fontSize: 14, fontWeight: '700' },
  table: { gap: 2 },
  row: { flexDirection: 'row', paddingVertical: 3, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  label: { flex: 2, color: colors.textMuted, fontSize: 13 },
  value: { flex: 1, color: colors.text, fontSize: 13, textAlign: 'right', fontVariant: ['tabular-nums'] },
  head: { color: colors.textMuted, fontWeight: '700', fontSize: 12 },
  title: { color: colors.text, fontWeight: '700', fontSize: 14 },
  top: { gap: 4 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, paddingVertical: 2 },
  topName: { color: colors.text, fontSize: 13, flex: 1 },
  topCount: { color: colors.textMuted, fontSize: 13, fontVariant: ['tabular-nums'] },
});
