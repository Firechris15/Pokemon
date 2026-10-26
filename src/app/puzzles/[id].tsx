import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { DuelBoard } from '@/components/duel/DuelBoard';
import { useDuelActions } from '@/components/duel/useDuelActions';
import { AppText } from '@/components/ui/AppText';
import { Button, IconButton } from '@/components/ui/Button';
import { showToast } from '@/components/ui/dialogs';
import { displayName } from '@/features/cards/labels';
import { useCards } from '@/features/cards/useCards';
import { buildMove, isError, type Intent } from '@/features/duel/builder';
import { describeMove } from '@/features/duel/moves';
import { findCard } from '@/features/duel/state';
import type { DuelMove } from '@/features/duel/types';
import { DIFFICULTY_LABELS } from '@/features/puzzles/rating';
import { expectedMove, puzzleCardIds, revealStep, startSession, tryMove, withHint, type SolveSession } from '@/features/puzzles/solver';
import { isRatedAttempt, todaysDaily, usePuzzle, usePuzzles } from '@/features/puzzles/store';
import { useSettings } from '@/features/settings/store';
import type { Puzzle } from '@/features/puzzles/types';
import { colors, radius, spacing, WIDE_BREAKPOINT } from '@/theme';

export default function PuzzleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const puzzle = usePuzzle(id);
  if (!puzzle) {
    return (
      <View style={styles.center}>
        <AppText variant="muted">Puzzle nicht gefunden.</AppText>
      </View>
    );
  }
  return <Solver key={puzzle.id} puzzle={puzzle} />;
}

type Feedback = { tone: 'success' | 'error' | 'info'; text: string; detail: string[] };
type RatingChange = { before: number; after: number; delta: number };

function Solver({ puzzle }: { puzzle: Puzzle }) {
  const { width, height } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;
  const ids = useMemo(() => puzzleCardIds(puzzle), [puzzle]);
  const cards = useCards(ids);
  const isDaily = usePuzzles((s) => todaysDaily(s.daily)?.puzzleId === puzzle.id);
  const language = useSettings((s) => s.language);
  const [area, setArea] = useState({ w: 0, h: 0 });
  const [session, setSession] = useState<SolveSession>(() => startSession(puzzle));
  const [rated, setRated] = useState(() => isRatedAttempt(puzzle, usePuzzles.getState().stats));
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [highlight, setHighlight] = useState<ReadonlySet<string>>(new Set());
  const [ratingChange, setRatingChange] = useState<RatingChange | null>(null);

  // Bookkeeping for the attempt record; only read in handlers.
  const attempt = useRef({ startedAt: 0, rated, touched: false, recorded: false, ratedFailed: false, change: null as RatingChange | null, session });

  const cardOf = (cardId: number) => cards.get(cardId);
  const update = (next: SolveSession) => {
    attempt.current.session = next;
    attempt.current.touched = true;
    setSession(next);
  };

  const record = async (final: SolveSession) => {
    const a = attempt.current;
    if (a.recorded) return;
    a.recorded = true;
    const solved = final.status === 'solved';
    if (a.rated && solved && !a.ratedFailed && final.mistakes === 0 && final.hints === 0) {
      a.change = await usePuzzles.getState().applyRating(puzzle.id, true);
      setRatingChange(a.change);
    }
    await usePuzzles.getState().recordAttempt({
      puzzleId: puzzle.id,
      solved,
      mistakes: final.mistakes,
      hints: final.hints,
      durationMs: Date.now() - a.startedAt,
      rated: a.rated,
      ratingBefore: a.change?.before ?? null,
      ratingAfter: a.change?.after ?? null,
      daily: isDaily,
    });
  };

  // Leaving an unfinished attempt counts as unsolved.
  useEffect(() => {
    const a = attempt.current;
    a.startedAt = Date.now();
    return () => {
      if (a.touched && !a.recorded) record(a.session).catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** The first mistake, hint or revealed move costs the rated attempt. */
  const failRated = async () => {
    const a = attempt.current;
    if (!a.rated || a.ratedFailed) return;
    a.ratedFailed = true;
    a.change = await usePuzzles.getState().applyRating(puzzle.id, false);
    setRatingChange(a.change);
  };

  const nameOf = (cardId: number) => {
    const card = cards.get(cardId);
    return card ? displayName(card, language) : `#${cardId}`;
  };
  const describe = (move: DuelMove) => move.note || describeMove(move, nameOf);

  const play = (intent: Intent) => {
    if (session.status !== 'playing') return;
    const move = buildMove(session.state, intent, cardOf);
    if (isError(move)) {
      showToast(move.error, 'error');
      return;
    }
    const result = tryMove(puzzle, session, move);
    update(result.session);
    if (!result.correct) {
      setFeedback({ tone: 'error', text: 'Nicht der gesuchte Zug – versuch es noch einmal.', detail: [describeMove(move, nameOf)] });
      failRated();
      return;
    }
    setHighlight(new Set([intent.uid]));
    if (result.session.status === 'solved') {
      setFeedback({ tone: 'success', text: 'Gelöst!', detail: result.auto.map(describe) });
      record(result.session);
    } else {
      setFeedback({ tone: 'success', text: 'Richtig!', detail: result.auto.map((m) => `Antwort: ${describe(m)}`) });
    }
  };

  const actions = useDuelActions({ state: session.state, cards, actor: 'me', onIntent: play });

  const hint = () => {
    const move = expectedMove(puzzle, session);
    if (!move) return;
    const first = session.hints === 0;
    update(withHint(session));
    failRated();
    const card = findCard(session.state, move.from, move.cardId);
    setHighlight(new Set(card ? [card.uid] : []));
    setFeedback({ tone: 'info', text: first ? `Tipp: Nutze ${nameOf(move.cardId)}.` : `Tipp: ${describeMove(move, nameOf)}`, detail: [] });
  };

  const reveal = () => {
    const move = expectedMove(puzzle, session);
    if (!move) return;
    const result = revealStep(puzzle, session);
    if (!result.correct) return;
    update(result.session);
    failRated();
    const card = findCard(result.session.state, move.to ?? move.from, move.cardId);
    setHighlight(new Set(card ? [card.uid] : []));
    setFeedback({ tone: 'info', text: `Lösung: ${describeMove(move, nameOf)}`, detail: result.auto.map(describe) });
    if (result.session.status === 'revealed') record(result.session);
  };

  const restart = () => {
    const a = attempt.current;
    if (a.touched && !a.recorded) record(a.session);
    const fresh = startSession(puzzle);
    attempt.current = { startedAt: Date.now(), rated: false, touched: false, recorded: false, ratedFailed: a.ratedFailed, change: null, session: fresh };
    setRated(false);
    setSession(fresh);
    setFeedback(null);
    setHighlight(new Set());
  };

  const next = () => {
    const { puzzles, stats, rating } = usePuzzles.getState();
    const open = puzzles
      .filter((p) => p.id !== puzzle.id && !stats[p.id]?.solved && p.solutions.length > 0)
      .sort((a, b) => Math.abs(a.rating - rating.rating) - Math.abs(b.rating - rating.rating));
    const target = open[0] ?? puzzles[(puzzles.findIndex((p) => p.id === puzzle.id) + 1) % puzzles.length];
    if (target && target.id !== puzzle.id) router.replace({ pathname: '/puzzles/[id]', params: { id: target.id } });
    else showToast('Keine weiteren Puzzles.');
  };

  const done = session.status !== 'playing';
  const boardBox = wide ? { flex: 1 } : { height: Math.min(width * 1.3, height * 0.62) };

  const panel = (
    <View style={styles.panel}>
      <View style={styles.badges}>
        {isDaily ? <Badge icon="calendar" text="Tagespuzzle" color={colors.accent} /> : null}
        <Badge icon="flag" text={puzzle.task || 'Puzzle'} color={colors.info} />
        <Badge icon="speedometer" text={`${DIFFICULTY_LABELS[puzzle.difficulty]} · ${Math.round(puzzle.rating)}`} color={colors.textMuted} />
        <Badge icon={rated ? 'trophy' : 'school'} text={rated ? 'Gewertet' : 'Übung'} color={rated ? colors.primary : colors.textMuted} />
      </View>
      {puzzle.description ? <AppText>{puzzle.description}</AppText> : null}
      <AppText variant="small">Ziehe Karten auf eine Zone oder tippe sie für Aktionen an. Langes Drücken zeigt die Karte groß.</AppText>

      {feedback ? (
        <View testID="puzzle-feedback" style={[styles.feedback, { borderLeftColor: feedback.tone === 'success' ? colors.primary : feedback.tone === 'error' ? colors.danger : colors.info }]}>
          <AppText style={styles.feedbackTitle}>{feedback.text}</AppText>
          {feedback.detail.map((line, i) => (
            <AppText key={i} variant="muted">
              {line}
            </AppText>
          ))}
        </View>
      ) : null}

      {ratingChange ? (
        <AppText testID="rating-change" style={{ color: ratingChange.delta >= 0 ? colors.primary : colors.danger, fontWeight: '700' }}>
          Rating {ratingChange.after} ({ratingChange.delta >= 0 ? '+' : ''}
          {ratingChange.delta})
        </AppText>
      ) : null}

      {done && puzzle.explanation ? (
        <View style={styles.explanation} testID="puzzle-explanation">
          <AppText variant="label">Erklärung</AppText>
          <AppText>{puzzle.explanation}</AppText>
        </View>
      ) : null}

      <View style={styles.buttons}>
        {done ? (
          <>
            <Button testID="puzzle-next" label="Nächstes Puzzle" icon="arrow-forward" variant="primary" onPress={next} />
            <Button testID="puzzle-restart" label="Nochmal" icon="refresh" onPress={restart} />
          </>
        ) : (
          <>
            <Button testID="puzzle-hint" label="Tipp" icon="bulb-outline" onPress={hint} />
            <Button testID="puzzle-reveal" label={session.hints > 0 ? 'Nächster Lösungszug' : 'Lösung zeigen'} icon="eye-outline" onPress={reveal} />
            <Button testID="puzzle-restart" label="Neu starten" icon="refresh" variant="ghost" onPress={restart} />
          </>
        )}
      </View>

      <View style={styles.history}>
        <AppText variant="label">Züge ({session.history.length})</AppText>
        {session.history.length === 0 ? <AppText variant="small">Noch keine Züge.</AppText> : null}
        {session.history.map((move, i) => (
          <AppText key={`${move.id}-${i}`} variant={move.auto ? 'small' : 'body'} testID={`history-${i}`}>
            {move.auto ? '↳ ' : `${session.history.slice(0, i + 1).filter((m) => !m.auto).length}. `}
            {describeMove(move, nameOf)}
          </AppText>
        ))}
      </View>
    </View>
  );

  return (
    <View style={[styles.root, wide && styles.row]}>
      <Stack.Screen
        options={{
          title: puzzle.title,
          headerRight: () =>
            puzzle.source === 'user' ? (
              <IconButton icon="create-outline" label="Bearbeiten" onPress={() => router.push({ pathname: '/puzzles/edit/[id]', params: { id: puzzle.id } })} />
            ) : null,
        }}
      />
      <View style={[styles.boardBox, boardBox]} onLayout={(e) => setArea({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {area.w > 0 ? (
          <DuelBoard
            state={session.state}
            cards={cards}
            width={area.w}
            height={area.h}
            highlight={highlight}
            onDrop={done ? undefined : actions.onDrop}
            onCardPress={done ? undefined : actions.onCardPress}
            onPilePress={actions.onPilePress}
          />
        ) : null}
      </View>
      <ScrollView style={wide ? styles.side : styles.below} contentContainerStyle={styles.sideContent}>
        {panel}
      </ScrollView>
    </View>
  );
}

function Badge({ icon, text, color }: { icon: ComponentProps<typeof Ionicons>['name']; text: string; color: string }) {
  return (
    <View style={styles.badge}>
      <Ionicons name={icon} size={14} color={color} />
      <AppText variant="small" style={{ color }}>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  row: { flexDirection: 'row' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  boardBox: { alignItems: 'center', justifyContent: 'center', padding: spacing.sm },
  side: { width: 360, maxWidth: 360, borderLeftWidth: 1, borderLeftColor: colors.border, backgroundColor: colors.surface },
  below: { flex: 1, backgroundColor: colors.surface },
  sideContent: { padding: spacing.lg },
  panel: { gap: spacing.md },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  feedback: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, borderLeftWidth: 4, gap: 4 },
  feedbackTitle: { fontWeight: '700', fontSize: 17 },
  explanation: { gap: spacing.xs, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  history: { gap: 4, marginTop: spacing.sm },
});
