import { StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '@/theme';

/**
 * Small chart primitives for probabilities (dataviz guidelines: one
 * sequential hue, same-ramp track for meters, thin bars with a rounded data
 * end, values in text colours next to the marks).
 */
export const VIZ = {
  fill: '#3987e5',
  track: 'rgba(16, 66, 129, 0.55)',
  baseline: '#45413c',
};

export function formatPercent(p: number | null | undefined): string {
  if (p === null || p === undefined || Number.isNaN(p)) return '–';
  return `${(p * 100).toFixed(1).replace('.', ',')} %`;
}

/** Horizontal meter for a single probability. */
export function Meter({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${pct}%` }]} />
    </View>
  );
}

/** Column chart with labelled columns, e.g. the number of starters in hand. */
export function ColumnChart({ title, data, height = 120 }: { title: string; data: { label: string; value: number }[]; height?: number }) {
  const max = Math.max(0.0001, ...data.map((d) => d.value));
  return (
    <View style={styles.chart} accessibilityLabel={`${title}: ${data.map((d) => `${d.label}: ${formatPercent(d.value)}`).join(', ')}`}>
      <Text style={styles.chartTitle}>{title}</Text>
      <View style={[styles.columns, { height: height + 20 }]}>
        {data.map((d) => (
          <View key={d.label} style={styles.columnSlot}>
            <Text style={styles.columnValue}>{formatPercent(d.value)}</Text>
            <View style={[styles.column, { height: Math.max(2, (d.value / max) * height) }]} />
          </View>
        ))}
      </View>
      <View style={styles.baseline} />
      <View style={styles.labels}>
        {data.map((d) => (
          <Text key={d.label} style={styles.columnLabel}>
            {d.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 8, borderRadius: 4, backgroundColor: VIZ.track, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: VIZ.fill, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  chart: { gap: 6, flex: 1, minWidth: 220 },
  chartTitle: { color: colors.text, fontWeight: '700', fontSize: 14 },
  columns: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  columnSlot: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  column: { width: 24, backgroundColor: VIZ.fill, borderTopLeftRadius: radius.sm - 2, borderTopRightRadius: radius.sm - 2 },
  columnValue: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  baseline: { height: 1, backgroundColor: VIZ.baseline },
  labels: { flexDirection: 'row', gap: 2 },
  columnLabel: { flex: 1, textAlign: 'center', color: colors.textMuted, fontSize: 12 },
});
