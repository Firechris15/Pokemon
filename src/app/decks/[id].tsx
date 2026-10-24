import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CardSearchPanel } from '@/components/cards/CardSearchPanel';
import { CardTile } from '@/components/cards/CardTile';
import { AppText } from '@/components/ui/AppText';
import { Button, IconButton } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { promptDialog, showToast } from '@/components/ui/dialogs';
import { openCardDetail, type CardActionsComponent } from '@/features/cards/detailStore';
import { prefetchImages } from '@/features/cards/imageCache';
import { displayName } from '@/features/cards/labels';
import type { Card } from '@/features/cards/types';
import { useCards } from '@/features/cards/useCards';
import { copyYdke, exportDeckFile } from '@/features/decks/exporter';
import { countByClass, groupSection } from '@/features/decks/sorting';
import { useDeck, useDecks } from '@/features/decks/store';
import { DECK_LIMITS, SECTION_LABELS, type Deck, type DeckSection } from '@/features/decks/types';
import { defaultSectionFor, remainingCopies, validateDeck, type DeckValidation } from '@/features/decks/validation';
import { useSettings } from '@/features/settings/store';
import { colors, radius, spacing, WIDE_BREAKPOINT } from '@/theme';

const SECTION_MAX: Record<DeckSection, number> = {
  main: DECK_LIMITS.mainMax,
  extra: DECK_LIMITS.extraMax,
  side: DECK_LIMITS.sideMax,
};

/** Adds a card if the deck rules allow it; explains why not otherwise. */
async function addWithRules(snapshot: Deck, card: Card, section: DeckSection): Promise<boolean> {
  const { banlist, language } = useSettings.getState();
  const deck = useDecks.getState().decks.find((d) => d.id === snapshot.id) ?? snapshot;
  const name = displayName(card, language);
  if (card.cardClass === 'token' || card.cardClass === 'skill') {
    showToast(`${name} kann nicht ins Deck.`, 'error');
    return false;
  }
  if (section === 'main' && card.isExtraDeck) section = 'extra';
  if (section === 'extra' && !card.isExtraDeck) section = 'main';
  if (remainingCopies(deck, card, banlist) <= 0) {
    showToast(`${name}: keine weitere Kopie erlaubt (max. 3 bzw. Banlist).`, 'error');
    return false;
  }
  if (deck[section].length >= SECTION_MAX[section]) {
    showToast(`${SECTION_LABELS[section]} ist voll (${SECTION_MAX[section]}).`, 'error');
    return false;
  }
  await useDecks.getState().addCard(deck.id, card.id, section);
  return true;
}

export default function DeckEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const deck = useDeck(id);
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;
  const [tab, setTab] = useState<'deck' | 'search'>('deck');
  const prefetchFull = useSettings((s) => s.prefetchDeckImages);

  const allIds = useMemo(() => (deck ? [...deck.main, ...deck.extra, ...deck.side] : []), [deck]);
  const cards = useCards(allIds);

  // Keep the deck's images available offline.
  useEffect(() => {
    if (cards.size === 0) return;
    const imageIds = [...cards.values()].map((c) => c.imageIds[0]);
    prefetchImages(imageIds, 'small');
    if (prefetchFull) prefetchImages(imageIds, 'full');
  }, [cards, prefetchFull]);

  const DetailActions = useMemo<CardActionsComponent>(() => makeDetailActions(id), [id]);

  if (!deck) {
    return (
      <View style={styles.missing}>
        <AppText variant="muted">Deck nicht gefunden.</AppText>
      </View>
    );
  }

  const header = (
    <Stack.Screen
      options={{
        title: deck.name,
        headerRight: () => <HeaderActions deck={deck} />,
      }}
    />
  );

  const search = (
    <CardSearchPanel
      deckCardsOnly
      detailActions={DetailActions}
      renderActions={(card) => <SearchRowActions deck={deck} card={card} />}
    />
  );

  if (wide) {
    return (
      <View style={styles.wideRoot}>
        {header}
        <View style={styles.deckPane}>
          <DeckView deck={deck} cards={cards} DetailActions={DetailActions} />
        </View>
        <View style={styles.searchPane}>{search}</View>
      </View>
    );
  }

  return (
    <View style={styles.narrowRoot}>
      {header}
      <View style={styles.tabs}>
        <Chip label={`Deck (${deck.main.length}/${deck.extra.length}/${deck.side.length})`} selected={tab === 'deck'} onPress={() => setTab('deck')} />
        <Chip label="Karten hinzufügen" selected={tab === 'search'} onPress={() => setTab('search')} testID="tab-search" />
      </View>
      {tab === 'deck' ? (
        <DeckView deck={deck} cards={cards} DetailActions={DetailActions} />
      ) : (
        <View style={styles.narrowSearch}>{search}</View>
      )}
    </View>
  );
}

function HeaderActions({ deck }: { deck: Deck }) {
  const rename = async () => {
    const name = await promptDialog({ title: 'Deck umbenennen', defaultValue: deck.name });
    if (name) await useDecks.getState().rename(deck.id, name);
  };
  return (
    <View style={styles.headerActions}>
      <IconButton icon="create-outline" label="Umbenennen" onPress={rename} />
      <IconButton icon="link-outline" label="ydke-Link kopieren" onPress={() => copyYdke(deck)} />
      <IconButton icon="share-outline" label="Als .ydk exportieren" onPress={() => exportDeckFile(deck)} testID="export-ydk" />
    </View>
  );
}

function SearchRowActions({ deck, card }: { deck: Deck; card: Card }) {
  const inDeck = [...deck.main, ...deck.extra, ...deck.side].filter((id) => id === card.id).length;
  return (
    <>
      {inDeck > 0 ? <AppText style={styles.inDeck}>{inDeck}×</AppText> : null}
      <IconButton
        icon="add-circle"
        color={colors.primary}
        size={28}
        label={`${card.isExtraDeck ? 'Extra' : 'Main'} Deck hinzufügen`}
        onPress={() => addWithRules(deck, card, defaultSectionFor(card))}
        testID={`add-${card.id}`}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Zum Side Deck hinzufügen"
        onPress={() => addWithRules(deck, card, 'side')}
        style={({ pressed }) => [styles.sideButton, pressed && { backgroundColor: colors.border }]}
        testID={`add-side-${card.id}`}>
        <AppText style={styles.sideButtonText}>S</AppText>
      </Pressable>
    </>
  );
}

function makeDetailActions(deckId: string): CardActionsComponent {
  return function DeckDetailActions({ card }: { card: Card }) {
    const deck = useDeck(deckId);
    if (!deck) return null;
    const { removeCard, moveCard } = useDecks.getState();
    const target = defaultSectionFor(card);
    const inTarget = deck[target].filter((id) => id === card.id).length;
    const inSide = deck.side.filter((id) => id === card.id).length;
    const label = target === 'extra' ? 'Extra' : 'Main';
    return (
      <View style={{ gap: spacing.sm, width: '100%' }}>
        <AppText variant="label">
          Im Deck: {label} {inTarget} · Side {inSide}
        </AppText>
        <View style={styles.detailButtons}>
          <Button size="sm" variant="primary" icon="add" label={`+1 ${label}`} onPress={() => addWithRules(deck, card, target)} testID="detail-add" />
          <Button size="sm" icon="remove" label={`−1 ${label}`} disabled={inTarget === 0} onPress={() => removeCard(deck.id, card.id, target)} testID="detail-remove" />
          <Button size="sm" icon="add" label="+1 Side" onPress={() => addWithRules(deck, card, 'side')} />
          <Button size="sm" icon="remove" label="−1 Side" disabled={inSide === 0} onPress={() => removeCard(deck.id, card.id, 'side')} />
          <Button size="sm" icon="arrow-forward" label={`${label} → Side`} disabled={inTarget === 0 || deck.side.length >= DECK_LIMITS.sideMax} onPress={() => moveCard(deck.id, card.id, target, 'side')} />
          <Button size="sm" icon="arrow-back" label={`Side → ${label}`} disabled={inSide === 0} onPress={() => moveCard(deck.id, card.id, 'side', target)} />
        </View>
      </View>
    );
  };
}

function DeckView({ deck, cards, DetailActions }: { deck: Deck; cards: Map<number, Card>; DetailActions: CardActionsComponent }) {
  const banlist = useSettings((s) => s.banlist);
  const language = useSettings((s) => s.language);
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  const validation = useMemo(() => validateDeck(deck, cards, banlist, language), [deck, cards, banlist, language]);
  const classes = countByClass(deck.main, cards);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[styles.deckContent, { paddingBottom: insets.bottom + spacing.xl }]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width - spacing.lg * 2)}>
      <ValidationBar validation={validation} banlist={banlist} />
      <AppText variant="small">
        {classes.monster} Monster · {classes.spell} Zauber · {classes.trap} Fallen · Banlist {banlist.toUpperCase()} · Tippen = Details,
        lange drücken = 1 Kopie entfernen
      </AppText>
      {width > 0
        ? (['main', 'extra', 'side'] as const).map((section) => (
            <SectionGrid
              key={section}
              deck={deck}
              section={section}
              cards={cards}
              width={width}
              validation={validation}
              DetailActions={DetailActions}
              language={language}
            />
          ))
        : null}
    </ScrollView>
  );
}

function ValidationBar({ validation, banlist }: { validation: DeckValidation; banlist: string }) {
  const [open, setOpen] = useState(false);
  const errors = validation.issues.filter((i) => i.severity === 'error');
  const warnings = validation.issues.filter((i) => i.severity === 'warning');
  const ok = validation.valid;
  return (
    <Pressable
      testID="validation-bar"
      onPress={() => setOpen((v) => !v)}
      style={[styles.validation, { borderColor: ok ? colors.primary : colors.warning }]}>
      <View style={styles.validationHeader}>
        <Ionicons name={ok ? 'shield-checkmark' : 'warning'} size={20} color={ok ? colors.primary : colors.warning} />
        <AppText style={{ flex: 1, fontWeight: '700', color: ok ? colors.primary : colors.warning }}>
          {ok ? `Deck ist legal (${banlist.toUpperCase()})` : `${errors.length} ${errors.length === 1 ? 'Problem' : 'Probleme'}`}
          {warnings.length ? ` · ${warnings.length} Hinweis${warnings.length === 1 ? '' : 'e'}` : ''}
        </AppText>
        {validation.issues.length > 0 ? <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} /> : null}
      </View>
      {open
        ? validation.issues.map((issue, index) => (
            <AppText key={index} variant="small" style={{ color: issue.severity === 'error' ? colors.text : colors.textMuted }}>
              • {issue.message}
            </AppText>
          ))
        : null}
    </Pressable>
  );
}

function SectionGrid({
  deck,
  section,
  cards,
  width,
  validation,
  DetailActions,
  language,
}: {
  deck: Deck;
  section: DeckSection;
  cards: Map<number, Card>;
  width: number;
  validation: DeckValidation;
  DetailActions: CardActionsComponent;
  language: 'de' | 'en';
}) {
  const entries = useMemo(() => groupSection(deck[section], cards, language), [deck, section, cards, language]);
  const count = deck[section].length;
  const columns = Math.max(4, Math.floor(width / 92));
  const gap = spacing.sm;
  const tileWidth = (width - gap * (columns - 1)) / columns;
  const sectionError = validation.issues.some((i) => i.section === section && i.severity === 'error' && i.cardId === undefined);
  const limitLabel = section === 'main' ? `${DECK_LIMITS.mainMin}–${DECK_LIMITS.mainMax}` : `max. ${SECTION_MAX[section]}`;
  const sequence = entries.map((e) => e.id);

  return (
    <View style={styles.section} testID={`section-${section}`}>
      <View style={styles.sectionHeader}>
        <AppText variant="title">{SECTION_LABELS[section]}</AppText>
        <View style={[styles.countPill, sectionError && { backgroundColor: colors.danger }]}>
          <AppText style={styles.countPillText}>{count}</AppText>
        </View>
        <AppText variant="small">{limitLabel}</AppText>
      </View>
      {entries.length === 0 ? (
        <AppText variant="small" style={styles.emptySection}>
          {section === 'side' ? 'Kein Side Deck.' : 'Noch keine Karten – über die Suche hinzufügen.'}
        </AppText>
      ) : (
        <View style={[styles.grid, { gap }]}>
          {entries.map((entry) =>
            entry.card ? (
              <CardTile
                key={entry.id}
                testID={`deck-card-${section}-${entry.id}`}
                card={entry.card}
                width={tileWidth}
                count={entry.count}
                flagged={validation.flaggedCards.has(entry.id)}
                onPress={(card) => openCardDetail(card.id, { sequence, actions: DetailActions })}
                onLongPress={(card) => {
                  useDecks.getState().removeCard(deck.id, card.id, section);
                  showToast(`${displayName(card, language)} entfernt`);
                }}
              />
            ) : (
              <View key={entry.id} style={[styles.unknownCard, { width: tileWidth }]}>
                <AppText variant="small">#{entry.id}</AppText>
                <AppText variant="small">×{entry.count}</AppText>
              </View>
            )
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  wideRoot: { flex: 1, flexDirection: 'row', backgroundColor: colors.bg },
  deckPane: { flex: 1.3, borderRightWidth: 1, borderRightColor: colors.border },
  searchPane: { flex: 1, maxWidth: 560, padding: spacing.lg, paddingBottom: 0 },
  narrowRoot: { flex: 1, backgroundColor: colors.bg },
  narrowSearch: { flex: 1, paddingHorizontal: spacing.lg },
  tabs: { flexDirection: 'row', gap: spacing.sm, padding: spacing.lg, paddingBottom: spacing.sm },
  headerActions: { flexDirection: 'row', gap: 2 },
  deckContent: { padding: spacing.lg, gap: spacing.lg },
  validation: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: 6, backgroundColor: colors.surface },
  validationHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  section: { gap: spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  countPill: { backgroundColor: colors.surfaceRaised, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 1 },
  countPillText: { fontWeight: '800' },
  emptySection: { paddingVertical: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  unknownCard: {
    aspectRatio: 0.69,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inDeck: { color: colors.textMuted, fontWeight: '700', marginRight: 2 },
  sideButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideButtonText: { fontWeight: '800', fontSize: 13 },
  detailButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
