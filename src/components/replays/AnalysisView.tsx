import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { confirmDialog } from '@/components/ui/dialogs';
import { analyzeReplay, type AnalyzeStep } from '@/features/analysis/analyze';
import { loadApiKey } from '@/features/analysis/keyStore';
import type { Names } from '@/features/analysis/prompt';
import type { AnalysedSuggestion, MatchAnalysis } from '@/features/analysis/types';
import type { Outcome, ReplayInfo, Suggestion, SuggestionCheck } from '@/features/engine/types';
import { saveAnalysis, type Replay } from '@/features/replays/repository';
import { useSettings } from '@/features/settings/store';
import { formatDateTime } from '@/lib/text';
import { colors, radius, spacing } from '@/theme';

const STEP_TEXT: Record<AnalyzeStep, string> = {
  models: 'Verbindung zur Claude API …',
  claude: 'Claude analysiert das Duell … (das kann eine Minute dauern)',
  engine: 'Die Regel-Engine prüft die vorgeschlagenen Züge …',
};

type Props = {
  replay: Replay;
  info: ReplayInfo | null;
  names: Names;
  verify: (suggestions: Suggestion[]) => Promise<SuggestionCheck[]>;
  onShowFrame: (frame: number) => void;
  onShowTurn: (turn: number) => void;
};

/** KI-Kommentar (Claude API) with the engine's verdict on every suggested move. */
export function AnalysisView({ replay, info, names, verify, onShowFrame, onShowTurn }: Props) {
  const preferredModel = useSettings((s) => s.analysisModel);
  const [analysis, setAnalysis] = useState<MatchAnalysis | null>(replay.analysis ?? null);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [step, setStep] = useState<AnalyzeStep | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Checked again whenever the screen comes back into view (e.g. after entering the key in the settings).
  useFocusEffect(
    useCallback(() => {
      loadApiKey()
        .then((key) => setHasKey(Boolean(key)))
        .catch(() => setHasKey(false));
    }, [])
  );

  const run = async () => {
    const apiKey = await loadApiKey();
    if (!apiKey || !info) return;
    setError(null);
    try {
      const result = await analyzeReplay({ replay, info, names, apiKey, preferredModel, verify, onStep: setStep });
      await saveAnalysis(replay.id, result);
      setAnalysis(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStep(null);
    }
  };

  const remove = async () => {
    if (!(await confirmDialog({ title: 'KI-Kommentar löschen?', confirmLabel: 'Löschen', destructive: true }))) return;
    await saveAnalysis(replay.id, null);
    setAnalysis(null);
  };

  if (step) {
    return (
      <View style={styles.center} testID="analysis-running">
        <ActivityIndicator color={colors.primary} />
        <AppText variant="muted" style={{ textAlign: 'center' }}>
          {STEP_TEXT[step]}
        </AppText>
      </View>
    );
  }

  if (!analysis) {
    return (
      <View style={styles.root} testID="analysis-empty">
        <AppText>
          Claude kommentiert das Duell: Wendepunkte, Fehler und bessere Züge. Jeder vorgeschlagene Zug wird danach mit der Regel-Engine nachgespielt.
        </AppText>
        <AppText variant="small">
          Gesendet werden Spielverlauf, dein Deck und deine Entscheidungen (keine verdeckten Karten des Gegners). Die Anfrage läuft mit deinem eigenen API-Schlüssel und
          kostet je nach Modell und Duell-Länge ein paar Cent.
        </AppText>
        {hasKey === false ? (
          <View style={styles.box}>
            <AppText>Dafür brauchst du einen API-Schlüssel der Claude API (console.anthropic.com).</AppText>
            <Button testID="analysis-settings" label="In den Einstellungen hinterlegen" icon="key-outline" onPress={() => router.push('/settings')} />
          </View>
        ) : (
          <Button
            testID="analysis-request"
            label="KI-Kommentar anfordern"
            icon="sparkles-outline"
            variant="primary"
            disabled={!info || hasKey !== true}
            onPress={run}
          />
        )}
        {!info ? <AppText variant="small">Das Replay wird noch geladen …</AppText> : null}
        {error ? (
          <AppText style={{ color: colors.danger }} testID="analysis-error">
            {error}
          </AppText>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.root} testID="analysis-result">
      <View style={styles.note}>
        <Ionicons name="information-circle-outline" size={16} color={colors.warning} />
        <Text style={styles.noteText}>
          Regelaussagen und Rulings der KI können falsch sein. Geprüft werden nur die vorgeschlagenen Züge: Die Regel-Engine spielt sie nach.
        </Text>
      </View>
      <AppText testID="analysis-summary">{analysis.summary}</AppText>

      {analysis.turningPoints.length ? (
        <View style={styles.section}>
          <AppText variant="label">Wendepunkte</AppText>
          {analysis.turningPoints.map((t, i) => (
            <Pressable key={i} onPress={() => onShowTurn(t.turn)} style={styles.turning}>
              <Text style={styles.turnBadge}>Zug {t.turn}</Text>
              <Text style={styles.turningText}>{t.text}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.section}>
        <AppText variant="label">Bessere Züge</AppText>
        {analysis.suggestions.length === 0 ? <AppText variant="muted">Keine Vorschläge – die KI sieht keine klar besseren Züge.</AppText> : null}
        {analysis.suggestions.map((s, i) => (
          <SuggestionCard key={i} suggestion={s} onShow={() => onShowFrame(s.frame)} />
        ))}
        {analysis.invalid > 0 ? (
          <AppText variant="small">
            {analysis.invalid} Vorschlag/Vorschläge der KI passten zu keinem erlaubten Zug und werden nicht angezeigt.
          </AppText>
        ) : null}
      </View>

      {analysis.tips.length ? (
        <View style={styles.section}>
          <AppText variant="label">Tipps</AppText>
          {analysis.tips.map((t, i) => (
            <AppText key={i}>• {t}</AppText>
          ))}
        </View>
      ) : null}

      <AppText variant="small">
        {analysis.modelName} · {formatDateTime(analysis.createdAt)} · {analysis.usage.input.toLocaleString('de-DE')} Tokens rein, {analysis.usage.output.toLocaleString('de-DE')}{' '}
        raus
      </AppText>
      <View style={styles.buttons}>
        <Button testID="analysis-again" label="Neu analysieren" icon="refresh" disabled={!info} onPress={run} />
        <Button label="Löschen" icon="trash-outline" variant="ghost" onPress={remove} />
      </View>
      {error ? <AppText style={{ color: colors.danger }}>{error}</AppText> : null}
    </View>
  );
}

function verdict(check: SuggestionCheck | null): { text: string; color: string; icon: keyof typeof Ionicons.glyphMap } {
  if (!check) return { text: 'Nicht geprüft', color: colors.textMuted, icon: 'help-circle-outline' };
  if (check.status === 'illegal') return { text: 'Engine: so nicht erlaubt', color: colors.danger, icon: 'close-circle' };
  if (check.status === 'unknown') return { text: `Engine: nicht prüfbar – ${check.reason}`, color: colors.textMuted, icon: 'help-circle-outline' };
  const diff = check.alternative.score - check.actual.score;
  if (check.alternative.winner === 'me' && check.actual.winner !== 'me') return { text: 'Engine: gewinnt das Duell in diesem Zug', color: colors.primary, icon: 'checkmark-circle' };
  if (diff > 0.03) return { text: 'Engine: erlaubt, Zugende besser', color: colors.primary, icon: 'checkmark-circle' };
  if (diff < -0.03) return { text: 'Engine: erlaubt, Zugende schlechter', color: colors.warning, icon: 'alert-circle' };
  return { text: 'Engine: erlaubt, Zugende ähnlich', color: colors.info, icon: 'checkmark-circle-outline' };
}

const outcomeText = (o: Outcome) => `LP ${o.lp[0]} : ${o.lp[1]} · Feld ${o.field[0]} : ${o.field[1]} · Hand ${o.hand[0]} : ${o.hand[1]}`;

function SuggestionCard({ suggestion: s, onShow }: { suggestion: AnalysedSuggestion; onShow: () => void }) {
  const v = verdict(s.check);
  return (
    <View style={styles.card} testID={`suggestion-${s.decision}`}>
      <Text style={styles.cardHead}>
        E{s.decision} · Zug {s.turn}
      </Text>
      <Text style={styles.played}>Gespielt: {s.chosenLabel}</Text>
      <Text style={styles.better}>Besser: {s.optionLabel}</Text>
      <AppText variant="small" style={{ color: colors.text }}>
        {s.reason}
      </AppText>
      <View style={styles.verdict} testID={`suggestion-check-${s.decision}`}>
        <Ionicons name={v.icon} size={16} color={v.color} />
        <Text style={[styles.verdictText, { color: colors.text }]}>{v.text}</Text>
      </View>
      {s.check?.status === 'ok' ? (
        <View style={styles.compare}>
          <Text style={styles.compareText}>Zugende mit Vorschlag (Simulation): {outcomeText(s.check.alternative)}</Text>
          <Text style={styles.compareText}>Zugende im Duell: {outcomeText(s.check.actual)}</Text>
          <Text style={styles.hint}>Du : Gegner. Nach dem Vorschlag spielt die KI Stufe 1 beide Seiten bis zum Ende dieses Zugs.</Text>
        </View>
      ) : null}
      <Button size="sm" label="Im Replay zeigen" icon="play-skip-forward-outline" onPress={onShow} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  center: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  box: { gap: spacing.sm, backgroundColor: colors.surfaceAlt, padding: spacing.md, borderRadius: radius.md },
  note: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', backgroundColor: colors.surfaceAlt, padding: spacing.sm, borderRadius: radius.md },
  noteText: { color: colors.textMuted, fontSize: 12, flex: 1 },
  section: { gap: spacing.sm },
  turning: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  turnBadge: { color: colors.accent, fontWeight: '700', fontSize: 12, minWidth: 52 },
  turningText: { color: colors.text, fontSize: 13, flex: 1 },
  card: { gap: 6, backgroundColor: colors.surfaceAlt, padding: spacing.md, borderRadius: radius.md },
  cardHead: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  played: { color: colors.textMuted, fontSize: 13 },
  better: { color: colors.text, fontSize: 14, fontWeight: '700' },
  verdict: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  verdictText: { fontSize: 13, fontWeight: '600', flex: 1 },
  compare: { gap: 2 },
  compareText: { color: colors.text, fontSize: 12, fontVariant: ['tabular-nums'] },
  hint: { color: colors.textFaint, fontSize: 11 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
