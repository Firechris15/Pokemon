import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { displayName } from '@/features/cards/labels';
import type { Card } from '@/features/cards/types';
import { evaluatePractice, type PracticeResult } from '@/features/handtrainer/classify';
import { getPracticeSummary, recordPractice, type PracticeSummary } from '@/features/handtrainer/repository';
import { handSize, PLAYABLE_RULE } from '@/features/handtrainer/stats';
import { metaOf, type DeckMeta } from '@/features/handtrainer/tags';
import { useSettings } from '@/features/settings/store';
import { shuffled } from '@/lib/random';
import { colors, radius, spacing } from '@/theme';

import { HandCards, type CardHighlight } from './HandCards';
import { TagBadges } from './TagViews';

type Phase = 'question' | 'choose' | 'result';

/**
 * Practice: decide whether a random hand is playable and pick the best
 * starter; the answer is graded against the user's own tags and ranking.
 */
export function PracticeTab({
  deckId,
  mainDeck,
  meta,
  cards,
  goingFirst,
  width,
  onEditTags,
}: {
  deckId: string;
  mainDeck: number[];
  meta: DeckMeta;
  cards: Map<number, Card>;
  goingFirst: boolean;
  width: number;
  onEditTags: () => void;
}) {
  const language = useSettings((s) => s.language);
  const size = handSize(goingFirst);
  const [hand, setHand] = useState<number[]>(() => shuffled(mainDeck).slice(0, size));
  const [phase, setPhase] = useState<Phase>('question');
  const [chosen, setChosen] = useState<number | null>(null);
  const [result, setResult] = useState<PracticeResult | null>(null);
  const [session, setSession] = useState({ total: 0, correct: 0, streak: 0 });
  const [summary, setSummary] = useState<PracticeSummary | null>(null);
  const hasStarters = mainDeck.some((id) => metaOf(meta, id).tags.includes('starter'));

  const nameOf = (id: number) => {
    const card = cards.get(id);
    return card ? displayName(card, language) : `#${id}`;
  };

  const refreshSummary = useCallback(() => {
    getPracticeSummary(deckId)
      .then(setSummary)
      .catch(() => undefined);
  }, [deckId]);
  useEffect(refreshSummary, [refreshSummary]);

  const nextHand = () => {
    setHand(shuffled(mainDeck).slice(0, size));
    setPhase('question');
    setChosen(null);
    setResult(null);
  };

  // A different hand size (first/second) needs a new hand.
  const [handFor, setHandFor] = useState(goingFirst);
  if (handFor !== goingFirst) {
    setHandFor(goingFirst);
    setHand(shuffled(mainDeck).slice(0, size));
    setPhase('question');
    setChosen(null);
    setResult(null);
  }

  const submit = async (playable: boolean, cardId: number | null) => {
    const graded = evaluatePractice(hand, meta, goingFirst, { playable, cardId }, nameOf);
    setResult(graded);
    setPhase('result');
    setSession((s) => ({ total: s.total + 1, correct: s.correct + (graded.correct ? 1 : 0), streak: graded.correct ? s.streak + 1 : 0 }));
    await recordPractice({ deckId, goingFirst, hand, answerPlayable: playable, answerCard: cardId, correct: graded.correct });
    refreshSummary();
  };

  if (!hasStarters) {
    return (
      <View style={styles.panel}>
        <AppText variant="title">Erst Starter taggen</AppText>
        <AppText variant="muted">
          Der Übungsmodus bewertet deine Antworten anhand deiner eigenen Tags. Markiere im Reiter „Tags“ mindestens einen Starter (und am besten auch
          Bricks und Handtraps).
        </AppText>
        <Button label="Zu den Tags" icon="pricetags-outline" variant="primary" onPress={onEditTags} style={{ alignSelf: 'flex-start' }} />
      </View>
    );
  }

  const highlight = (id: number): CardHighlight => {
    if (phase === 'choose') return chosen === id ? 'selected' : null;
    if (phase === 'result' && result) {
      if (result.classification.acceptable.includes(id)) return 'best';
      if (chosen === id) return 'wrong';
    }
    return null;
  };

  const footer = (id: number, index: number) => {
    if (phase === 'choose') {
      const selected = chosen === id;
      return (
        <Pressable
          testID={`choose-${index}`}
          accessibilityRole="radio"
          accessibilityState={{ selected }}
          onPress={() => setChosen(id)}
          style={({ pressed }) => [styles.choose, selected && styles.chooseActive, pressed && { opacity: 0.8 }]}>
          <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={16} color={selected ? colors.onPrimary : colors.textMuted} />
          <AppText style={[styles.chooseText, selected && { color: colors.onPrimary }]}>{selected ? 'Gewählt' : 'Wählen'}</AppText>
        </Pressable>
      );
    }
    if (phase === 'result' && result) {
      return (
        <View style={{ gap: 4 }}>
          {result.classification.acceptable.includes(id) && index === hand.indexOf(id) ? (
            <AppText variant="small" style={{ color: colors.primary, fontWeight: '700' }}>
              Beste Wahl
            </AppText>
          ) : chosen === id && index === hand.indexOf(id) ? (
            <AppText variant="small" style={{ color: colors.danger, fontWeight: '700' }}>
              Deine Wahl
            </AppText>
          ) : null}
          <TagBadges tags={metaOf(meta, id).tags} compact />
        </View>
      );
    }
    return null;
  };

  const accuracy = (correct: number, total: number) => (total === 0 ? '–' : `${Math.round((correct / total) * 100)} %`);

  return (
    <View style={styles.root}>
      <View style={styles.scoreRow} testID="practice-score">
        <AppText variant="small">
          Diese Sitzung: <AppText style={styles.strong}>{session.correct}/{session.total}</AppText> richtig · Serie{' '}
          <AppText style={styles.strong}>{session.streak}</AppText>
        </AppText>
        {summary && summary.total > 0 ? (
          <AppText variant="small">
            Gesamt: {summary.total} Hände · {accuracy(summary.correct, summary.total)} richtig · letzte {summary.recentTotal}:{' '}
            {accuracy(summary.recentCorrect, summary.recentTotal)}
          </AppText>
        ) : null}
      </View>

      <HandCards hand={hand} cards={cards} width={width} footer={footer} highlight={highlight} />

      <View style={styles.panel} testID="practice-panel">
        {phase === 'question' ? (
          <>
            <AppText variant="title">Ist diese Hand spielbar?</AppText>
            <AppText variant="small">
              {goingFirst ? 'Du bist Erster (5 Karten).' : 'Du bist Zweiter (5 Karten + 1 gezogen).'} {goingFirst ? PLAYABLE_RULE.first : PLAYABLE_RULE.second}
            </AppText>
            <View style={styles.actions}>
              <Button testID="answer-playable" label="Spielbar" icon="checkmark" variant="primary" onPress={() => setPhase('choose')} />
              <Button testID="answer-unplayable" label="Nicht spielbar" icon="close" onPress={() => submit(false, null)} />
            </View>
          </>
        ) : null}

        {phase === 'choose' ? (
          <>
            <AppText variant="title">Mit welcher Karte startest du?</AppText>
            <AppText variant="small">Tippe unter der Karte auf „Wählen“. Tippen auf das Bild zeigt die Karte groß.</AppText>
            <View style={styles.actions}>
              <Button testID="answer-submit" label="Auswerten" icon="checkmark-done" variant="primary" disabled={chosen === null} onPress={() => submit(true, chosen)} />
              <Button label="Zurück" variant="ghost" onPress={() => setPhase('question')} />
            </View>
          </>
        ) : null}

        {phase === 'result' && result ? (
          <>
            <View style={styles.verdict} testID="practice-verdict">
              <Ionicons name={result.correct ? 'checkmark-circle' : 'close-circle'} size={30} color={result.correct ? colors.primary : colors.danger} />
              <AppText variant="title">{result.correct ? 'Richtig!' : result.cardVerdict === 'other-starter' ? 'Fast!' : 'Leider falsch'}</AppText>
            </View>
            {result.messages.map((message, i) => (
              <AppText key={i} style={i === 0 ? { fontWeight: '700' } : undefined} variant={i === 0 ? 'body' : 'muted'}>
                {message}
              </AppText>
            ))}
            <Button testID="next-hand" label="Nächste Hand" icon="arrow-forward" variant="primary" onPress={nextHand} style={{ alignSelf: 'flex-start' }} />
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.lg },
  scoreRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.sm },
  strong: { color: colors.text, fontWeight: '800', fontSize: 13 },
  panel: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  verdict: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  choose: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
  },
  chooseActive: { backgroundColor: colors.info },
  chooseText: { fontWeight: '700', fontSize: 13, color: colors.text },
});
