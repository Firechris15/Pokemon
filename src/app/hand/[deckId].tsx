import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { DrawTab } from '@/components/handtrainer/DrawTab';
import { PracticeTab } from '@/components/handtrainer/PracticeTab';
import { StatsTab } from '@/components/handtrainer/StatsTab';
import { TagsTab } from '@/components/handtrainer/TagsTab';
import { AppText } from '@/components/ui/AppText';
import { Chip } from '@/components/ui/Chip';
import { Screen } from '@/components/ui/Screen';
import { useCards } from '@/features/cards/useCards';
import { useDeck } from '@/features/decks/store';
import { useDeckMeta } from '@/features/handtrainer/store';
import { colors, spacing } from '@/theme';

type Tab = 'draw' | 'tags' | 'stats' | 'practice';

const TABS: { key: Tab; label: string }[] = [
  { key: 'draw', label: 'Starthand' },
  { key: 'tags', label: 'Tags' },
  { key: 'stats', label: 'Statistik' },
  { key: 'practice', label: 'Üben' },
];

export default function HandTrainerScreen() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  const deck = useDeck(deckId);
  const meta = useDeckMeta((s) => s.byDeck[deckId]);
  const cards = useCards(deck?.main ?? []);
  const [tab, setTab] = useState<Tab>('draw');
  const [goingFirst, setGoingFirst] = useState(true);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    useDeckMeta.getState().load(deckId).catch(() => undefined);
  }, [deckId]);

  if (!deck) {
    return (
      <View style={styles.center}>
        <AppText variant="muted">Deck nicht gefunden.</AppText>
      </View>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: `Hand-Trainer · ${deck.name}` }} />
      <View style={styles.bar}>
        <View style={styles.tabs}>
          {TABS.map((t) => (
            <Chip key={t.key} testID={`hand-tab-${t.key}`} label={t.label} selected={tab === t.key} onPress={() => setTab(t.key)} />
          ))}
        </View>
        {tab === 'draw' || tab === 'practice' ? (
          <View style={styles.tabs}>
            <Chip testID="going-first" label="Als Erster (5)" selected={goingFirst} onPress={() => setGoingFirst(true)} color={colors.accent} />
            <Chip testID="going-second" label="Als Zweiter (6)" selected={!goingFirst} onPress={() => setGoingFirst(false)} color={colors.accent} />
          </View>
        ) : null}
      </View>

      {deck.main.length === 0 ? (
        <AppText variant="muted">Das Main Deck ist leer. Füge im Deck-Editor Karten hinzu.</AppText>
      ) : !meta ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
          {width === 0 ? null : tab === 'draw' ? (
            <DrawTab mainDeck={deck.main} meta={meta} cards={cards} goingFirst={goingFirst} width={width} />
          ) : tab === 'tags' ? (
            <TagsTab deckId={deck.id} mainDeck={deck.main} meta={meta} cards={cards} />
          ) : tab === 'stats' ? (
            <StatsTab mainDeck={deck.main} meta={meta} />
          ) : (
            <PracticeTab
              deckId={deck.id}
              mainDeck={deck.main}
              meta={meta}
              cards={cards}
              goingFirst={goingFirst}
              width={width}
              onEditTags={() => setTab('tags')}
            />
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  bar: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
