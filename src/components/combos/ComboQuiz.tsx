import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { CardChoiceGrid } from '@/components/cards/CardChoiceGrid';
import { CardTile } from '@/components/cards/CardTile';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { openCardDetail } from '@/features/cards/detailStore';
import { displayName } from '@/features/cards/labels';
import { useCards } from '@/features/cards/useCards';
import { ACTION_LABELS, ACTIONS, describeStep } from '@/features/combos/actions';
import { buildChoices, checkFreeAnswer, type FreeVerdict, type RunResult } from '@/features/combos/quiz';
import { describeDue } from '@/features/combos/srs';
import { boardAfter } from '@/features/combos/state';
import { useCombos } from '@/features/combos/store';
import type { Combo, ComboAction, ComboReview, QuizMode } from '@/features/combos/types';
import type { Deck } from '@/features/decks/types';
import { useSettings } from '@/features/settings/store';
import { colors, radius, spacing, WIDE_BREAKPOINT } from '@/theme';

import { StepRow } from './StepRow';
import { ZoneBoard } from './ZoneBoard';

type Feedback = { correct: boolean; verdict: FreeVerdict | 'choice'; pickedKey?: string };

/**
 * Combo quiz: shows the board before each step and asks for the next step,
 * either as multiple choice or by picking card + action freely.
 */
export function ComboQuiz({
  combo,
  mode,
  deck,
  onDone,
  doneLabel,
}: {
  combo: Combo;
  mode: QuizMode;
  deck: Deck | undefined;
  onDone: () => void;
  doneLabel: string;
}) {
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;
  const language = useSettings((s) => s.language);
  const [run, setRun] = useState(0);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<RunResult[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [freeCard, setFreeCard] = useState<number | null>(null);
  const [freeAction, setFreeAction] = useState<ComboAction | null>(null);
  const [review, setReview] = useState<ComboReview | null>(null);
  const [panelWidth, setPanelWidth] = useState(0);

  const comboIds = useMemo(
    () => [...combo.startingHand, ...combo.endBoard, ...combo.steps.flatMap((s) => [s.cardId, ...s.targets])],
    [combo]
  );
  const cards = useCards([...comboIds, ...(deck ? [...deck.main, ...deck.extra] : [])]);
  const nameOf = (id: number) => {
    const card = cards.get(id);
    return card ? displayName(card, language) : `#${id}`;
  };

  const finished = index >= combo.steps.length;
  const step = combo.steps[Math.min(index, combo.steps.length - 1)];
  const board = useMemo(() => boardAfter(combo, index), [combo, index]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- new options per run and step only
  const choices = useMemo(() => (mode === 'choice' && !finished ? buildChoices(combo, index, Math.random, (id) => cards.get(id)) : []), [combo, index, run, mode, finished]);

  const freeSections = useMemo(() => {
    if (mode !== 'free' || finished) return [];
    const onBoard = [...board.hand, ...board.field, ...board.gy, ...board.banished, ...board.material];
    const sections: { title: string; ids: number[] }[] = [
      { title: 'Hand', ids: board.hand },
      { title: 'Feld', ids: [...board.field, ...board.material] },
      { title: 'Friedhof', ids: board.gy },
      { title: 'Verbannt', ids: board.banished },
    ];
    if (deck) {
      sections.push({ title: 'Extra Deck', ids: deck.extra }, { title: 'Main Deck', ids: deck.main });
    }
    const listed = new Set([...onBoard, ...(deck ? [...deck.main, ...deck.extra] : [])]);
    sections.push({ title: 'Weitere Karten dieser Combo', ids: [...new Set(comboIds)].filter((id) => !listed.has(id)) });
    return sections.filter((s) => s.ids.length > 0);
  }, [mode, finished, board, deck, comboIds]);

  const answer = (correct: boolean, verdict: Feedback['verdict'], pickedKey?: string) => {
    setFeedback({ correct, verdict, pickedKey });
    setResults((r) => [...r, { stepId: step.id, correct }]);
  };

  const next = async () => {
    setFeedback(null);
    setFreeCard(null);
    setFreeAction(null);
    const nextIndex = index + 1;
    setIndex(nextIndex);
    if (nextIndex >= combo.steps.length) {
      setReview(await useCombos.getState().recordRun(combo.id, mode, results));
    }
  };

  const restart = () => {
    setRun((r) => r + 1);
    setIndex(0);
    setResults([]);
    setFeedback(null);
    setFreeCard(null);
    setFreeAction(null);
    setReview(null);
  };

  const history = (
    <View style={styles.history}>
      <AppText variant="label">Bisherige Schritte</AppText>
      {index === 0 ? <AppText variant="small">Noch keine – du startest mit der Hand oben.</AppText> : null}
      {combo.steps.slice(0, index).map((s, i) => (
        <StepRow key={s.id} step={s} index={i} cards={cards} nameOf={nameOf} status={results[i]?.correct ? 'correct' : 'wrong'} showNote={false} />
      ))}
    </View>
  );

  if (finished) {
    const correct = results.filter((r) => r.correct).length;
    const wrongIds = new Set(results.filter((r) => !r.correct).map((r) => r.stepId));
    const endBoard = combo.endBoard.length > 0 ? combo.endBoard : boardAfter(combo, combo.steps.length).field;
    return (
      <ScrollView contentContainerStyle={styles.summary} testID="quiz-summary">
        <View style={styles.summaryHeader}>
          <Ionicons name={correct === results.length ? 'trophy' : 'school'} size={40} color={correct === results.length ? colors.accent : colors.info} />
          <View style={{ flex: 1 }}>
            <AppText variant="heading">
              {correct} von {results.length} Schritten richtig
            </AppText>
            <AppText variant="muted">
              Nächste Wiederholung: {review ? describeDue(review) : '…'}
              {review && review.intervalDays >= 1 ? ` (Intervall ${review.intervalDays} ${review.intervalDays === 1 ? 'Tag' : 'Tage'})` : ''}
            </AppText>
          </View>
        </View>

        {wrongIds.size > 0 ? (
          <View style={styles.block}>
            <AppText variant="label">Diese Schritte nochmal ansehen</AppText>
            {combo.steps.map((s, i) => (wrongIds.has(s.id) ? <StepRow key={s.id} step={s} index={i} cards={cards} nameOf={nameOf} status="wrong" /> : null))}
          </View>
        ) : null}

        <View style={styles.block}>
          <AppText variant="label">Endboard</AppText>
          <View style={styles.cardRow}>
            {endBoard.map((id, i) => {
              const card = cards.get(id);
              return card ? <CardTile key={`${id}-${i}`} card={card} width={80} onPress={() => openCardDetail(id, { sequence: endBoard })} /> : null;
            })}
          </View>
        </View>

        <View style={styles.buttons}>
          <Button testID="quiz-restart" label="Nochmal" icon="refresh" onPress={restart} />
          <Button testID="quiz-done" label={doneLabel} icon="arrow-forward" variant="primary" onPress={onDone} />
        </View>
      </ScrollView>
    );
  }

  const question = (
    <View style={styles.question} onLayout={(e) => setPanelWidth(e.nativeEvent.layout.width - spacing.lg * 2)}>
      <AppText variant="label">
        Schritt {index + 1} von {combo.steps.length}
      </AppText>
      <AppText variant="title">Was ist der nächste Schritt?</AppText>

      {mode === 'choice'
        ? choices.map((option, i) => {
            const isPicked = feedback?.pickedKey === option.key;
            const tone = feedback ? (option.correct ? 'correct' : isPicked ? 'wrong' : 'idle') : 'idle';
            return (
              <Pressable
                key={option.key}
                testID={`quiz-option-${i}`}
                disabled={!!feedback}
                onPress={() => answer(option.correct, 'choice', option.key)}
                style={({ pressed }) => [
                  styles.option,
                  tone === 'correct' && styles.optionCorrect,
                  tone === 'wrong' && styles.optionWrong,
                  pressed && { backgroundColor: colors.surfaceRaised },
                ]}>
                <AppText style={styles.optionLetter}>{String.fromCharCode(65 + i)}</AppText>
                <AppText style={{ flex: 1 }}>{describeStep(option.step, nameOf)}</AppText>
                {tone === 'correct' ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} /> : null}
                {tone === 'wrong' ? <Ionicons name="close-circle" size={22} color={colors.danger} /> : null}
              </Pressable>
            );
          })
        : null}

      {mode === 'free' && !feedback ? (
        <View style={styles.block}>
          <AppText variant="small">1. Karte wählen (ⓘ zeigt die Karte groß)</AppText>
          {panelWidth > 0
            ? freeSections.map((section) => (
                <View key={section.title} style={{ gap: 6 }}>
                  <AppText variant="label">{section.title}</AppText>
                  <CardChoiceGrid
                    ids={section.ids}
                    cards={cards}
                    width={panelWidth}
                    tileWidth={72}
                    selected={(id) => id === freeCard}
                    onChoose={setFreeCard}
                    testIDPrefix="quiz-card"
                  />
                </View>
              ))
            : null}
          <AppText variant="small">2. Aktion wählen</AppText>
          <View style={styles.chips}>
            {ACTIONS.map((a) => (
              <Chip key={a} testID={`quiz-action-${a}`} label={ACTION_LABELS[a]} selected={freeAction === a} onPress={() => setFreeAction(a)} />
            ))}
          </View>
          <View style={styles.buttons}>
            <Button
              testID="quiz-check"
              label="Prüfen"
              icon="checkmark-done"
              variant="primary"
              disabled={freeCard === null || freeAction === null}
              onPress={() => {
                const verdict = checkFreeAnswer(step, { cardId: freeCard, action: freeAction });
                answer(verdict === 'correct', verdict);
              }}
            />
          </View>
        </View>
      ) : null}

      {!feedback ? (
        <Button label="Lösung zeigen" icon="eye-outline" variant="ghost" size="sm" onPress={() => answer(false, 'wrong')} style={{ alignSelf: 'flex-start' }} testID="quiz-reveal" />
      ) : (
        <View style={[styles.feedback, { borderColor: feedback.correct ? colors.primary : colors.danger }]} testID="quiz-feedback">
          <View style={styles.feedbackHeader}>
            <Ionicons name={feedback.correct ? 'checkmark-circle' : 'close-circle'} size={26} color={feedback.correct ? colors.primary : colors.danger} />
            <AppText variant="title">
              {feedback.correct
                ? 'Richtig!'
                : feedback.verdict === 'card-only'
                  ? 'Richtige Karte, falsche Aktion'
                  : feedback.verdict === 'action-only'
                    ? 'Richtige Aktion, falsche Karte'
                    : 'Falsch'}
            </AppText>
          </View>
          <AppText style={{ fontWeight: '700' }}>{describeStep(step, nameOf)}</AppText>
          {step.note ? <AppText variant="muted">{step.note}</AppText> : null}
          <Button testID="quiz-next" label={index + 1 >= combo.steps.length ? 'Ergebnis anzeigen' : 'Weiter'} icon="arrow-forward" variant="primary" onPress={next} style={{ alignSelf: 'flex-start' }} />
        </View>
      )}
    </View>
  );

  const boardView = (
    <View style={{ gap: spacing.lg }}>
      <ZoneBoard board={board} cards={cards} />
      {history}
    </View>
  );

  if (wide) {
    return (
      <View style={styles.wide}>
        <ScrollView style={styles.wideLeft} contentContainerStyle={styles.pad}>
          {boardView}
        </ScrollView>
        <ScrollView style={styles.wideRight} contentContainerStyle={styles.pad}>
          {question}
        </ScrollView>
      </View>
    );
  }
  return (
    <ScrollView contentContainerStyle={[styles.pad, { gap: spacing.lg }]}>
      <ZoneBoard board={board} cards={cards} tileWidth={56} />
      {question}
      {history}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wide: { flex: 1, flexDirection: 'row' },
  wideLeft: { flex: 1.1, borderRightWidth: 1, borderRightColor: colors.border },
  wideRight: { flex: 1 },
  pad: { padding: spacing.lg, paddingBottom: spacing.xxl * 2 },
  question: { gap: spacing.md },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionCorrect: { borderColor: colors.primary },
  optionWrong: { borderColor: colors.danger },
  optionLetter: { width: 22, fontWeight: '800', color: colors.textMuted },
  block: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  feedback: { gap: spacing.sm, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, backgroundColor: colors.surface },
  feedbackHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  history: { gap: spacing.sm },
  summary: { padding: spacing.lg, gap: spacing.xl, maxWidth: 900, width: '100%', alignSelf: 'center' },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  cardRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
