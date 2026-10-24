import { router, Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ComboQuiz } from '@/components/combos/ComboQuiz';
import { AppText } from '@/components/ui/AppText';
import { useCombo } from '@/features/combos/store';
import type { QuizMode } from '@/features/combos/types';
import { useDecks } from '@/features/decks/store';
import { colors } from '@/theme';

export default function ComboQuizScreen() {
  const { id, mode } = useLocalSearchParams<{ id: string; mode?: string }>();
  const combo = useCombo(id);
  const deck = useDecks((s) => s.decks.find((d) => d.id === combo?.deckId));
  const quizMode: QuizMode = mode === 'free' ? 'free' : 'choice';

  if (!combo || combo.steps.length === 0) {
    return (
      <View style={styles.center}>
        <AppText variant="muted">Diese Combo hat noch keine Schritte.</AppText>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: `${quizMode === 'free' ? 'Freies Quiz' : 'Quiz'} · ${combo.name}` }} />
      <ComboQuiz combo={combo} mode={quizMode} deck={deck} onDone={() => router.back()} doneLabel="Zurück" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
});
