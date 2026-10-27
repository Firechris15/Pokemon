import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';

import { colors, radius, spacing } from '@/theme';

/** Series colours (dataviz categorical slots 1 and 2, dark steps, validated on the app surface). */
export const SERIES = { me: '#3987e5', opp: '#d95926' };
const GRID = '#45413c';
// SVG text defaults to a serif font in browsers.
const FONT = Platform.OS === 'web' ? 'system-ui, -apple-system, sans-serif' : undefined;

type Point = { turn: number; me: number; opp: number };

/**
 * LP of both players after each turn. Tap a turn to see the exact values;
 * "Tabelle" shows the numbers as a table.
 */
export function LpChart({ data, width, onTurnPress }: { data: Point[]; width: number; onTurnPress?: (turn: number) => void }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const height = 180;
  const pad = { left: 40, right: 56, top: 12, bottom: 22 };
  const plotW = Math.max(60, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;
  const maxLp = Math.max(8000, ...data.map((p) => Math.max(p.me, p.opp)));
  const n = Math.max(1, data.length - 1);
  const x = (i: number) => pad.left + (i / n) * plotW;
  const y = (lp: number) => pad.top + plotH - (Math.max(0, lp) / maxLp) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxLp * f));
  const labelEvery = data.length <= 12 ? 1 : data.length <= 24 ? 2 : 5;
  const sel = selected !== null ? data[selected] : null;
  const last = data[data.length - 1];
  // Direct labels at the line ends, nudged apart when the lines end close together.
  let endMe = y(last?.me ?? 0);
  let endOpp = y(last?.opp ?? 0);
  if (Math.abs(endMe - endOpp) < 14) {
    const mid = (endMe + endOpp) / 2;
    const meAbove = (last?.me ?? 0) >= (last?.opp ?? 0);
    endMe = mid + (meAbove ? -7 : 7);
    endOpp = mid + (meAbove ? 7 : -7);
  }

  return (
    <View style={styles.root} accessibilityLabel={`Lebenspunkte je Zug: ${data.map((p) => `Zug ${p.turn}: du ${p.me}, Gegner ${p.opp}`).join('; ')}`}>
      <View style={styles.head}>
        <Text style={styles.title}>Lebenspunkte je Zug</Text>
        <View style={styles.legend}>
          <Legend color={SERIES.me} label="Du" />
          <Legend color={SERIES.opp} label="Gegner" />
          <Pressable onPress={() => setTable(!table)} hitSlop={8} testID="lp-table-toggle">
            <Text style={styles.toggle}>{table ? 'Diagramm' : 'Tabelle'}</Text>
          </Pressable>
        </View>
      </View>
      {table ? (
        <View style={styles.table} testID="lp-table">
          <Row cells={['Zug', 'Du', 'Gegner']} head />
          {data.map((p) => (
            <Row key={p.turn} cells={[p.turn === 0 ? 'Start' : String(p.turn), String(p.me), String(p.opp)]} />
          ))}
        </View>
      ) : (
        <>
          <Text style={styles.readout} testID="lp-readout">
            {sel ? `${sel.turn === 0 ? 'Start' : `Nach Zug ${sel.turn}`}: du ${sel.me} · Gegner ${sel.opp}` : 'Tippe auf einen Zug für die genauen Werte.'}
          </Text>
          <View>
            <Svg width={width} height={height}>
              {ticks.map((t) => (
                <Line key={t} x1={pad.left} x2={pad.left + plotW} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} strokeDasharray={t === 0 ? undefined : '2 4'} />
              ))}
              {ticks.map((t) => (
                <SvgText fontFamily={FONT} key={`l${t}`} x={pad.left - 6} y={y(t) + 4} fill={colors.textMuted} fontSize={10} textAnchor="end">
                  {t}
                </SvgText>
              ))}
              {data.map((p, i) =>
                i % labelEvery === 0 || i === data.length - 1 ? (
                  <SvgText fontFamily={FONT} key={`x${p.turn}`} x={x(i)} y={height - 6} fill={colors.textMuted} fontSize={10} textAnchor="middle">
                    {p.turn === 0 ? 'S' : p.turn}
                  </SvgText>
                ) : null
              )}
              {sel ? <Line x1={x(selected!)} x2={x(selected!)} y1={pad.top} y2={pad.top + plotH} stroke={colors.textFaint} strokeWidth={1} /> : null}
              <Polyline points={data.map((p, i) => `${x(i)},${y(p.opp)}`).join(' ')} fill="none" stroke={SERIES.opp} strokeWidth={2} strokeLinejoin="round" />
              <Polyline points={data.map((p, i) => `${x(i)},${y(p.me)}`).join(' ')} fill="none" stroke={SERIES.me} strokeWidth={2} strokeLinejoin="round" />
              {sel ? (
                <>
                  <Circle cx={x(selected!)} cy={y(sel.opp)} r={4.5} fill={SERIES.opp} stroke={colors.surface} strokeWidth={2} />
                  <Circle cx={x(selected!)} cy={y(sel.me)} r={4.5} fill={SERIES.me} stroke={colors.surface} strokeWidth={2} />
                </>
              ) : null}
              {last ? (
                <>
                  <SvgText fontFamily={FONT} x={pad.left + plotW + 6} y={endMe + 4} fill={colors.text} fontSize={11} fontWeight="600">
                    Du
                  </SvgText>
                  <SvgText fontFamily={FONT} x={pad.left + plotW + 6} y={endOpp + 4} fill={colors.text} fontSize={11} fontWeight="600">
                    Gegner
                  </SvgText>
                </>
              ) : null}
            </Svg>
            {/* Hit targets: one column per turn, wider than the marks. */}
            <View style={[StyleSheet.absoluteFill, styles.hits, { left: pad.left - plotW / n / 2, width: plotW + plotW / n }]}>
              {data.map((p, i) => (
                <Pressable
                  key={p.turn}
                  testID={`lp-turn-${p.turn}`}
                  style={styles.hit}
                  onPress={() => {
                    setSelected(i === selected ? null : i);
                    if (p.turn > 0) onTurnPress?.(p.turn);
                  }}
                />
              ))}
            </View>
          </View>
        </>
      )}
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function Row({ cells, head }: { cells: string[]; head?: boolean }) {
  return (
    <View style={styles.row}>
      {cells.map((c, i) => (
        <Text key={i} style={[styles.cell, head && styles.cellHead]}>
          {c}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.xs },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  title: { color: colors.text, fontWeight: '700', fontSize: 14 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 3, borderRadius: 2 },
  legendText: { color: colors.textMuted, fontSize: 12 },
  toggle: { color: colors.accent, fontSize: 12, fontWeight: '600' },
  readout: { color: colors.textMuted, fontSize: 12 },
  hits: { flexDirection: 'row' },
  hit: { flex: 1 },
  table: { borderRadius: radius.sm, overflow: 'hidden' },
  row: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: GRID },
  cell: { flex: 1, color: colors.text, fontSize: 12, paddingVertical: 4 },
  cellHead: { color: colors.textMuted, fontWeight: '700' },
});
