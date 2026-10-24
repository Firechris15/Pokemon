import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ComboQuiz } from '@/components/combos/ComboQuiz';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { dueCombos, useCombos } from '@/features/combos/store';
import type { QuizMode } from '@/features/combos/types';
import { useDecks } from '@/features/decks/store';
import { colors, spacing } from '@/theme';

/** Works through all due combos, most urgent first. */
export default function ComboReviewScreen() {
  const decks = useDecks((s) => s.decks);
  // The queue is fixed when the session starts; finished combos are no longer due.
  const [queue] = useState(() => {
    const { combos, reviews } = useCombos.getState();
    return dueCombos(combos, reviews).map((c) => c.id);
  });
  const [position, setPosition] = useState(0);
  const [mode, setMode] = useState<QuizMode | null>(null);
  const combo = useCombos((s) => s.combos.find((c) => c.id === queue[position]));

  if (queue.length === 0 || position >= queue.length || !combo) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Wiederholung' }} />
        <Ionicons name="checkmark-done-circle" size={56} color={colors.primary} />
        <AppText variant="title">{queue.length === 0 ? 'Nichts fällig' : 'Alle fälligen Combos wiederholt!'}</AppText>
        <Button label="Zur Übersicht" variant="primary" onPress={() => router.back()} />
      </View>
    );
  }

  if (mode === null) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Wiederholung' }} />
        <AppText variant="title">{queue.length} Combos sind fällig</AppText>
        <AppText variant="muted">Wie möchtest du üben?</AppText>
        <View style={styles.row}>
          <Chip label="Multiple Choice" selected={false} onPress={() => setMode('choice')} testID="review-mode-choice" />
          <Chip label="Freie Kartenauswahl" selected={false} onPress={() => setMode('free')} testID="review-mode-free" />
        </View>
      </View>
    );
  }

  const last = position + 1 >= queue.length;
  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: `Wiederholung ${position + 1}/${queue.length} · ${combo.name}` }} />
      <ComboQuiz
        key={combo.id}
        combo={combo}
        mode={mode}
        deck={decks.find((d) => d.id === combo.deckId)}
        doneLabel={last ? 'Fertig' : 'Nächste Combo'}
        onDone={() => setPosition((p) => p + 1)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.xl, backgroundColor: colors.bg },
  row: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
});
