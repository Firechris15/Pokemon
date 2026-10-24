import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { IconButton } from '@/components/ui/Button';
import { buildProfile, exactProbabilities, hypergeomAtLeast, hypergeomPmf, simulateHits, type DeckProfile } from '@/features/handtrainer/probability';
import { HAND_SIZE_FIRST, HAND_SIZE_SECOND, PLAYABLE_RULE, STARTER_BUCKETS, STATS } from '@/features/handtrainer/stats';
import { HAND_TAGS, metaOf, TAG_COLORS, TAG_LABELS, type DeckMeta, type HandTag } from '@/features/handtrainer/tags';
import { colors, radius, spacing } from '@/theme';

import { ColumnChart, formatPercent, Meter } from './charts';

const SIM_ITERATIONS = 100_000;
const SIM_BATCH = 5_000;

type Simulation = { first: number[]; second: number[]; done: number };

/** Runs the Monte Carlo check in small batches so the UI stays responsive. */
function useSimulation(profile: DeckProfile): Simulation | null {
  const [result, setResult] = useState<{ profile: DeckProfile; sim: Simulation } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const first = STATS.map((s) => s.test(true));
    const second = STATS.map((s) => s.test(false));
    const hitsFirst = first.map(() => 0);
    const hitsSecond = second.map(() => 0);
    let done = 0;
    const step = () => {
      if (cancelled || profile.deckSize === 0) return;
      const a = simulateHits(profile, HAND_SIZE_FIRST, first, SIM_BATCH, Math.random);
      const b = simulateHits(profile, HAND_SIZE_SECOND, second, SIM_BATCH, Math.random);
      a.forEach((h, i) => (hitsFirst[i] += h));
      b.forEach((h, i) => (hitsSecond[i] += h));
      done += SIM_BATCH;
      if (done % (SIM_BATCH * 4) === 0 || done >= SIM_ITERATIONS) {
        setResult({
          profile,
          sim: { first: hitsFirst.map((h) => h / done), second: hitsSecond.map((h) => h / done), done },
        });
      }
      if (done < SIM_ITERATIONS) setTimeout(step, 0);
    };
    const timer = setTimeout(step, 50);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [profile]);

  return result?.profile === profile ? result.sim : null;
}

/** Probability dashboard: exact (hypergeometric) values with a simulation check. */
export function StatsTab({ mainDeck, meta }: { mainDeck: number[]; meta: DeckMeta }) {
  const profile = useMemo(() => buildProfile(mainDeck, meta), [mainDeck, meta]);
  const tagCounts = useMemo(() => {
    const counts = Object.fromEntries(HAND_TAGS.map((t) => [t, 0])) as Record<HandTag, number>;
    for (const id of mainDeck) for (const tag of metaOf(meta, id).tags) counts[tag]++;
    return counts;
  }, [mainDeck, meta]);
  const exact = useMemo(
    () => ({
      first: exactProbabilities(profile, HAND_SIZE_FIRST, STATS.map((s) => s.test(true))),
      second: exactProbabilities(profile, HAND_SIZE_SECOND, STATS.map((s) => s.test(false))),
      bucketsFirst: exactProbabilities(profile, HAND_SIZE_FIRST, STARTER_BUCKETS.map((b) => b.test)),
      bucketsSecond: exactProbabilities(profile, HAND_SIZE_SECOND, STARTER_BUCKETS.map((b) => b.test)),
    }),
    [profile]
  );
  const sim = useSimulation(profile);
  const N = mainDeck.length;

  if (N < HAND_SIZE_SECOND) {
    return <AppText variant="muted">Das Main Deck braucht mindestens 6 Karten für die Statistik.</AppText>;
  }

  return (
    <View style={styles.root}>
      <AppText variant="small">
        Exakt berechnet (hypergeometrisch, {N} Karten im Main Deck). Zur Kontrolle eine Simulation mit {SIM_ITERATIONS.toLocaleString('de-DE')} zufälligen
        Händen{sim && sim.done < SIM_ITERATIONS ? ` (läuft: ${sim.done.toLocaleString('de-DE')})` : ''}.
      </AppText>

      <View style={styles.panel} testID="stats-table">
        <View style={[styles.row, styles.headerRow]}>
          <AppText variant="label" style={styles.labelCol}>
            Wahrscheinlichkeit
          </AppText>
          <AppText variant="label" style={styles.valueCol}>
            Als Erster (5)
          </AppText>
          <AppText variant="label" style={styles.valueCol}>
            Als Zweiter (6)
          </AppText>
        </View>
        {STATS.map((stat, i) => {
          const missing = stat.needs.filter((tag) => tagCounts[tag] === 0);
          return (
            <View key={stat.key} style={styles.row} testID={`stat-${stat.key}`}>
              <View style={styles.labelCol}>
                <AppText style={{ fontWeight: '600' }}>{stat.label}</AppText>
                {missing.length > 0 ? <AppText variant="small">Noch nicht getaggt: {missing.map((t) => TAG_LABELS[t]).join(', ')}</AppText> : null}
              </View>
              {[exact.first[i], exact.second[i]].map((value, column) => (
                <View key={column} style={styles.valueCol}>
                  {missing.length > 0 ? (
                    <AppText variant="small">–</AppText>
                  ) : (
                    <>
                      <View style={styles.valueLine}>
                        <AppText style={styles.value}>{formatPercent(value)}</AppText>
                        <AppText variant="small" style={styles.sim}>
                          Sim. {sim ? formatPercent(column === 0 ? sim.first[i] : sim.second[i]) : '…'}
                        </AppText>
                      </View>
                      <Meter value={value} />
                    </>
                  )}
                </View>
              ))}
            </View>
          );
        })}
        <AppText variant="small">
          „Spielbar“: als Erster {PLAYABLE_RULE.first.replace('Spielbar = ', '')} Als Zweiter {PLAYABLE_RULE.second.replace('Spielbar = ', '')} Kombinationen wie „Starter +
          Handtrap“ zählen nur mit zwei verschiedenen Karten.
        </AppText>
      </View>

      <View style={styles.split}>
        <View style={[styles.panel, styles.half]}>
          <AppText variant="label">Anzahl Starter in der Hand</AppText>
          {tagCounts.starter === 0 ? (
            <AppText variant="muted">Noch keine Starter getaggt.</AppText>
          ) : (
            <View style={styles.charts}>
              <ColumnChart title="Als Erster (5 Karten)" data={STARTER_BUCKETS.map((b, i) => ({ label: b.label, value: exact.bucketsFirst[i] }))} />
              <ColumnChart title="Als Zweiter (6 Karten)" data={STARTER_BUCKETS.map((b, i) => ({ label: b.label, value: exact.bucketsSecond[i] }))} />
            </View>
          )}
        </View>

        <View style={[styles.panel, styles.half]}>
          <AppText variant="label">Tags im Deck</AppText>
          {HAND_TAGS.map((tag) => (
            <View key={tag} style={styles.tagRow}>
              <View style={[styles.dot, { backgroundColor: TAG_COLORS[tag] }]} />
              <AppText style={{ flex: 1 }}>{TAG_LABELS[tag]}</AppText>
              <AppText style={styles.value}>{tagCounts[tag]}</AppText>
              <AppText variant="small" style={{ width: 150, textAlign: 'right' }}>
                Ø {((tagCounts[tag] * HAND_SIZE_FIRST) / N).toFixed(2).replace('.', ',')} / {((tagCounts[tag] * HAND_SIZE_SECOND) / N).toFixed(2).replace('.', ',')} pro Hand
              </AppText>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.split}>
        <View style={[styles.panel, styles.half]}>
          <AppText variant="label">Einzelkarte mindestens 1× in der Hand</AppText>
          <View style={[styles.row, styles.headerRow]}>
            <AppText variant="label" style={styles.labelCol}>
              Kopien
            </AppText>
            <AppText variant="label" style={styles.valueColSmall}>
              Erster
            </AppText>
            <AppText variant="label" style={styles.valueColSmall}>
              Zweiter
            </AppText>
          </View>
          {[1, 2, 3].map((copies) => (
            <View key={copies} style={styles.row}>
              <AppText style={styles.labelCol}>{copies}× im Deck</AppText>
              <AppText style={[styles.valueColSmall, styles.value]}>{formatPercent(hypergeomAtLeast(N, copies, HAND_SIZE_FIRST, 1))}</AppText>
              <AppText style={[styles.valueColSmall, styles.value]}>{formatPercent(hypergeomAtLeast(N, copies, HAND_SIZE_SECOND, 1))}</AppText>
            </View>
          ))}
        </View>
        <Calculator deckSize={N} />
      </View>
    </View>
  );
}

/** Free hypergeometric calculator: P(at least k of K copies in n cards from N). */
function Calculator({ deckSize }: { deckSize: number }) {
  const [N, setN] = useState(deckSize);
  const [K, setK] = useState(3);
  const [n, setHand] = useState(HAND_SIZE_FIRST);
  const [k, setMin] = useState(1);
  // Steppers clamp what they show; compute with the same clamped values.
  const copies = Math.min(K, N);
  const drawn = Math.min(n, N);
  const wanted = Math.min(k, copies, drawn);
  const atLeast = hypergeomAtLeast(N, copies, drawn, wanted);
  const exactly = hypergeomPmf(N, copies, drawn, wanted);

  return (
    <View style={[styles.panel, styles.half]} testID="calculator">
      <AppText variant="label">Freier Rechner</AppText>
      <Stepper label="Karten im Deck" value={N} min={1} max={60} onChange={setN} />
      <Stepper label="Gesuchte Karten im Deck" value={copies} min={0} max={N} onChange={setK} />
      <Stepper label="Gezogene Karten" value={drawn} min={1} max={Math.min(N, 15)} onChange={setHand} />
      <Stepper label="Davon mindestens" value={wanted} min={0} max={Math.min(copies, drawn)} onChange={setMin} />
      <View style={styles.result}>
        <AppText variant="small">Mindestens {wanted}:</AppText>
        <AppText style={styles.bigValue} testID="calculator-result">
          {formatPercent(atLeast)}
        </AppText>
        <AppText variant="small">
          Genau {wanted}: {formatPercent(exactly)}
        </AppText>
      </View>
    </View>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  return (
    <View style={styles.stepper}>
      <AppText style={{ flex: 1 }}>{label}</AppText>
      <IconButton icon="remove-circle-outline" label={`${label} verringern`} disabled={value <= min} onPress={() => onChange(clamp(value - 1))} />
      <AppText style={styles.stepperValue}>{clamp(value)}</AppText>
      <IconButton icon="add-circle-outline" label={`${label} erhöhen`} disabled={value >= max} onPress={() => onChange(clamp(value + 1))} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.lg },
  panel: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  headerRow: { paddingBottom: 2 },
  labelCol: { flex: 1.2 },
  valueCol: { flex: 1, gap: 4 },
  valueColSmall: { width: 80, textAlign: 'right' },
  valueLine: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm },
  value: { fontWeight: '800', fontVariant: ['tabular-nums'] },
  sim: { color: colors.textFaint },
  split: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  half: { flexGrow: 1, flexBasis: 340 },
  charts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xl },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  result: { alignItems: 'flex-start', gap: 2, paddingTop: spacing.sm },
  bigValue: { fontSize: 32, lineHeight: 40, fontWeight: '800' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepperValue: { width: 36, textAlign: 'center', fontWeight: '800', fontVariant: ['tabular-nums'] },
});
