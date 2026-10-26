import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CardDbPanel } from '@/components/CardDbPanel';
import { CardImage } from '@/components/cards/CardImage';
import { HomeTile } from '@/components/HomeTile';
import { AppText } from '@/components/ui/AppText';
import { IconButton } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { dueCombos, useCombos } from '@/features/combos/store';
import { useDecks } from '@/features/decks/store';
import { todaysDaily, usePuzzles } from '@/features/puzzles/store';
import { colors, radius, spacing } from '@/theme';

const TILES = [
  { key: 'decks', title: 'Decks', subtitle: 'Decks bauen, importieren und prüfen', icon: 'albums', color: '#81b64c', route: '/decks' },
  { key: 'cards', title: 'Karten', subtitle: 'Kartendatenbank durchsuchen und filtern', icon: 'search', color: '#5aa7e0', route: '/cards' },
  { key: 'hand', title: 'Hand-Trainer', subtitle: 'Starthände üben, Wahrscheinlichkeiten', icon: 'hand-left', color: '#e0b44c', route: '/hand' },
  { key: 'combos', title: 'Combos', subtitle: 'Combo-Routen lernen mit Quiz', icon: 'git-network', color: '#c06bd8', route: '/combos' },
  { key: 'puzzles', title: 'Puzzles', subtitle: 'Tägliche Puzzles mit Rating', icon: 'extension-puzzle', color: '#e5734b', route: '/puzzles' },
  { key: 'duel', title: 'KI-Duell', subtitle: 'Gegen die KI auf dem iPad duellieren', icon: 'hardware-chip', color: '#4bc0b5', phase: 'Phase 5' },
  { key: 'analysis', title: 'Analyse', subtitle: 'Replays und Match-Statistiken', icon: 'analytics', color: '#9aa4b5', phase: 'Phase 6' },
] as const;

export default function HomeScreen() {
  const [width, setWidth] = useState(0);
  const decks = useDecks((s) => s.decks);
  const combos = useCombos((s) => s.combos);
  const reviews = useCombos((s) => s.reviews);
  const dueCount = useMemo(() => dueCombos(combos, reviews).length, [combos, reviews]);
  const dailyOpen = usePuzzles((s) => {
    const today = todaysDaily(s.daily);
    return today !== undefined && today.solvedAt === null;
  });
  const badgeFor = (key: string) => {
    if (key === 'combos' && dueCount > 0) return `${dueCount} fällig`;
    if (key === 'puzzles' && dailyOpen) return 'Tagespuzzle';
    return undefined;
  };
  const columns = width >= 900 ? 4 : width >= 560 ? 3 : 2;
  const gap = spacing.md;
  const tileWidth = width > 0 ? (width - gap * (columns - 1)) / columns : 0;

  return (
    <Screen safeTop>
      <View style={styles.header}>
        <View style={styles.logo}>
          <AppText style={styles.logoText}>YGO</AppText>
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="heading">YGO Trainer</AppText>
          <AppText variant="small">Trainieren wie auf Chess.com – komplett offline</AppText>
        </View>
        <IconButton icon="settings-sharp" label="Einstellungen" onPress={() => router.push('/settings')} testID="open-settings" />
      </View>

      <CardDbPanel />

      <View style={styles.grid} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {tileWidth > 0
          ? TILES.map((tile) => (
              <HomeTile
                key={tile.key}
                testID={`tile-${tile.key}`}
                width={tileWidth}
                title={tile.title}
                subtitle={tile.subtitle}
                icon={tile.icon}
                color={tile.color}
                badge={'phase' in tile ? tile.phase : badgeFor(tile.key)}
                disabled={'phase' in tile}
                onPress={'route' in tile ? () => router.push(tile.route) : undefined}
              />
            ))
          : null}
      </View>

      {decks.length > 0 ? (
        <View style={{ gap: spacing.md }}>
          <AppText variant="label">Zuletzt bearbeitet</AppText>
          <View style={styles.recent}>
            {decks.slice(0, 6).map((deck) => (
              <Pressable
                key={deck.id}
                onPress={() => router.push({ pathname: '/decks/[id]', params: { id: deck.id } })}
                style={({ pressed }) => [styles.recentDeck, pressed && { opacity: 0.7 }]}>
                <CardImage imageId={deck.main[0] ?? deck.extra[0] ?? null} size="small" width={44} />
                <View style={{ flex: 1 }}>
                  <AppText numberOfLines={1} style={{ fontWeight: '700' }}>
                    {deck.name}
                  </AppText>
                  <AppText variant="small">
                    {deck.main.length} / {deck.extra.length} / {deck.side.length}
                  </AppText>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  logo: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 4,
    borderBottomColor: colors.primaryPressed,
  },
  logoText: { color: '#fff', fontWeight: '900', fontSize: 17, letterSpacing: 0.5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  recent: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  recentDeck: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    paddingRight: spacing.lg,
    minWidth: 220,
    flexGrow: 1,
    flexBasis: 220,
    maxWidth: 360,
  },
});
