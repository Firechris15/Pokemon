import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { CardImage } from '@/components/cards/CardImage';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { useDecks } from '@/features/decks/store';
import { colors, radius, spacing } from '@/theme';

/** Hand trainer start: pick the deck to train with. */
export default function HandTrainerDeckPicker() {
  const decks = useDecks((s) => s.decks);

  return (
    <Screen maxWidth={900}>
      <AppText variant="muted">
        Ziehe Starthände, tagge deine Karten (Starter, Extender, Handtrap, Brick, Board-Breaker), sieh dir die Wahrscheinlichkeiten an und übe, welche
        Hände spielbar sind.
      </AppText>
      {decks.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="albums-outline" size={48} color={colors.textFaint} />
          <AppText variant="muted">Noch keine Decks vorhanden.</AppText>
          <Button label="Deck anlegen oder importieren" icon="albums" variant="primary" onPress={() => router.push('/decks')} />
        </View>
      ) : (
        <View style={styles.list}>
          <AppText variant="label">Deck wählen</AppText>
          {decks.map((deck) => (
            <Pressable
              key={deck.id}
              testID={`hand-deck-${deck.id}`}
              onPress={() => router.push({ pathname: '/hand/[deckId]', params: { deckId: deck.id } })}
              style={({ pressed }) => [styles.deck, pressed && { backgroundColor: colors.surfaceAlt }]}>
              <CardImage imageId={deck.main[0] ?? null} size="small" width={44} />
              <View style={{ flex: 1 }}>
                <AppText style={{ fontWeight: '700' }}>{deck.name}</AppText>
                <AppText variant="small">{deck.main.length} Karten im Main Deck</AppText>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  deck: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    paddingRight: spacing.md,
  },
  empty: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxl },
});
