import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { decisionOptions, sameResponse } from '@/features/analysis/options';
import type { Names } from '@/features/analysis/prompt';
import type { DecisionReview, EngineResponse, Outcome, ReplayInfo, ReplayReview, ReviewVerdict } from '@/features/engine/types';
import { saveReview, type Replay } from '@/features/replays/repository';
import { useReplayViewer } from '@/features/replays/viewerStore';
import { formatDateTime } from '@/lib/text';
import { colors, radius, spacing } from '@/theme';

export const VERDICTS: Record<ReviewVerdict, { label: string; plural: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  best: { label: 'Bester Zug', plural: 'beste Züge', color: colors.primary, icon: 'star' },
  good: { label: 'Gut', plural: 'gute Züge', color: colors.primary, icon: 'checkmark-circle' },
  inaccuracy: { label: 'Ungenauigkeit', plural: 'Ungenauigkeiten', color: colors.accent, icon: 'help-circle' },
  mistake: { label: 'Fehler', plural: 'Fehler', color: colors.warning, icon: 'alert-circle' },
  blunder: { label: 'Patzer', plural: 'Patzer', color: colors.danger, icon: 'close-circle' },
};

const ORDER: ReviewVerdict[] = ['blunder', 'mistake', 'inaccuracy', 'good', 'best'];

type Props = {
  replay: Replay;
  info: ReplayInfo | null;
  names: Names;
  onShowFrame: (frame: number) => void;
};

/**
 * Engine review without AI: every decision is compared with all its
 * alternatives, each played on by the level 1 AI until the turn ends.
 */
export function EngineReviewView({ replay, info, names, onShowFrame }: Props) {
  const progress = useReplayViewer((s) => s.reviewProgress);
  const [review, setReview] = useState<ReplayReview | null>(replay.review ?? null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const cancelled = useRef(false);
  const run = async () => {
    setError(null);
    cancelled.current = false;
    const result = await useReplayViewer.getState().review();
    if (!result) {
      if (!cancelled.current) setError('Die Engine-Analyse ist fehlgeschlagen. Bitte erneut versuchen.');
      return;
    }
    await saveReview(replay.id, result);
    setReview(result);
  };

  if (progress) {
    return (
      <View style={styles.center} testID="review-running">
        <AppText>Die Engine spielt deine Entscheidungen durch …</AppText>
        <ProgressBar value={progress.total ? progress.done / progress.total : null} />
        <AppText variant="small" testID="review-progress">
          {progress.total ? `Entscheidung ${progress.done} von ${progress.total}${remaining(progress)}` : 'Wird vorbereitet …'}
        </AppText>
        <Button
          testID="review-cancel"
          label="Abbrechen"
          icon="close"
          variant="ghost"
          onPress={() => {
            cancelled.current = true;
            useReplayViewer.getState().cancelReview();
          }}
        />
      </View>
    );
  }

  if (!review) {
    return (
      <View style={styles.root} testID="review-empty">
        <AppText>
          Die Regel-Engine prüft jede deiner Entscheidungen: Sie spielt jede erlaubte Möglichkeit bis zum Ende des Zugs durch und vergleicht LP, Feld und Hand. So
          findest du Patzer, Fehler und Ungenauigkeiten wie bei der Partie-Analyse von Chess.com.
        </AppText>
        <AppText variant="small">Kostenlos und offline. Je nach Länge des Duells dauert es einige Sekunden bis etwa eine Minute.</AppText>
        <Button testID="review-start" label="Engine-Analyse starten" icon="analytics-outline" variant="primary" disabled={!info} onPress={run} />
        {!info ? <AppText variant="small">Das Replay wird noch geladen …</AppText> : null}
        {error ? <AppText style={{ color: colors.danger }}>{error}</AppText> : null}
      </View>
    );
  }

  const labelOf = (index: number, response: EngineResponse) => {
    const point = info?.decisions.find((d) => d.index === index);
    if (!point) return 'unbekannt';
    return decisionOptions(point.request, names).find((o) => sameResponse(o.response, response))?.label ?? 'unbekannt';
  };
  const flagged = review.decisions.filter((d) => d.verdict === 'inaccuracy' || d.verdict === 'mistake' || d.verdict === 'blunder');
  const shown = showAll ? review.decisions : flagged;

  return (
    <View style={styles.root} testID="review-result">
      <View style={styles.summary}>
        <View>
          <Text style={styles.accuracyLabel}>Genauigkeit</Text>
          <Text style={styles.accuracy} testID="review-accuracy">
            {review.accuracy} %
          </Text>
        </View>
        <View style={styles.counts}>
          {ORDER.map((v) => (
            <View key={v} style={styles.count}>
              <Ionicons name={VERDICTS[v].icon} size={14} color={VERDICTS[v].color} />
              <Text style={styles.countText}>
                {review.counts[v]} {review.counts[v] === 1 ? VERDICTS[v].label : VERDICTS[v].plural}
              </Text>
            </View>
          ))}
        </View>
      </View>
      <AppText variant="small">
        {review.decisions.length} Entscheidungen geprüft. Nach jeder Möglichkeit spielt die KI Stufe 1 beide Seiten bis zum Ende des Zugs; längerfristige Pläne (z. B.
        Karten für den nächsten Zug aufheben) erkennt die Engine nicht.
      </AppText>
      {review.diverged !== null ? (
        <AppText variant="small" style={{ color: colors.warning }}>
          Das Replay passt ab einer Stelle nicht mehr zu den aktuellen Kartenskripten; spätere Entscheidungen fehlen.
        </AppText>
      ) : null}

      {flagged.length === 0 && !showAll ? <AppText testID="review-clean">Keine Fehler gefunden – stark gespielt!</AppText> : null}
      {shown.map((d) => (
        <DecisionCard key={d.index} decision={d} chosen={labelOf(d.index, d.chosen.response)} better={d.best ? labelOf(d.index, d.best.response) : null} onShow={() => onShowFrame(d.frame)} />
      ))}

      <View style={styles.buttons}>
        <Button testID="review-show-all" label={showAll ? 'Nur Fehler zeigen' : 'Alle Entscheidungen zeigen'} icon="list-outline" onPress={() => setShowAll(!showAll)} />
        <Button testID="review-again" label="Neu analysieren" icon="refresh" variant="ghost" disabled={!info} onPress={run} />
      </View>
      <AppText variant="small">Analysiert am {formatDateTime(review.createdAt)}</AppText>
      {error ? <AppText style={{ color: colors.danger }}>{error}</AppText> : null}
    </View>
  );
}

/** " · noch etwa 20 s", estimated from the decisions done so far. */
function remaining(p: { done: number; total: number; startedAt: number }): string {
  if (p.done === 0 || p.done >= p.total) return '';
  const left = ((Date.now() - p.startedAt) / p.done) * (p.total - p.done) / 1000;
  return left < 5 ? ' · gleich fertig' : left < 90 ? ` · noch etwa ${Math.round(left / 5) * 5} s` : ` · noch etwa ${Math.round(left / 60)} min`;
}

const outcomeText = (o: Outcome) =>
  o.winner === 'me' ? 'du gewinnst das Duell' : o.winner === 'opp' ? 'du verlierst das Duell' : `LP ${o.lp[0]} : ${o.lp[1]} · Feld ${o.field[0]} : ${o.field[1]} · Hand ${o.hand[0]} : ${o.hand[1]}`;

function DecisionCard({ decision: d, chosen, better, onShow }: { decision: DecisionReview; chosen: string; better: string | null; onShow: () => void }) {
  const v = VERDICTS[d.verdict];
  return (
    <View style={[styles.card, { borderLeftColor: v.color }]} testID={`review-decision-${d.index}`}>
      <View style={styles.cardHead}>
        <Ionicons name={v.icon} size={16} color={v.color} />
        <Text style={styles.cardTitle}>
          Zug {d.turn} · {v.label}
        </Text>
      </View>
      <Text style={styles.played}>Gespielt: {chosen}</Text>
      {better && d.best ? <Text style={styles.better}>Besser: {better}</Text> : null}
      <Text style={styles.outcome}>Zugende so: {outcomeText(d.chosen.outcome)}</Text>
      {d.best ? <Text style={styles.outcome}>Zugende mit dem besseren Zug: {outcomeText(d.best.outcome)}</Text> : null}
      <Button size="sm" label="Im Replay zeigen" icon="play-skip-forward-outline" onPress={onShow} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  center: { gap: spacing.md, paddingVertical: spacing.lg },
  summary: { flexDirection: 'row', gap: spacing.lg, alignItems: 'center', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md },
  accuracyLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  accuracy: { color: colors.text, fontSize: 28, fontWeight: '800', fontVariant: ['tabular-nums'] },
  counts: { flex: 1, gap: 2 },
  count: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  countText: { color: colors.text, fontSize: 12 },
  card: { gap: 6, backgroundColor: colors.surfaceAlt, padding: spacing.md, borderRadius: radius.md, borderLeftWidth: 3 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
  played: { color: colors.textMuted, fontSize: 13 },
  better: { color: colors.text, fontSize: 14, fontWeight: '700' },
  outcome: { color: colors.text, fontSize: 12, fontVariant: ['tabular-nums'] },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
