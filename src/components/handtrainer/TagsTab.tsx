import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CardImage } from '@/components/cards/CardImage';
import { AppText } from '@/components/ui/AppText';
import { Button, IconButton } from '@/components/ui/Button';
import { showToast } from '@/components/ui/dialogs';
import { openCardDetail } from '@/features/cards/detailStore';
import { displayName } from '@/features/cards/labels';
import type { Card } from '@/features/cards/types';
import { groupSection } from '@/features/decks/sorting';
import { rankedStarters } from '@/features/handtrainer/metaOps';
import { useDeckMeta } from '@/features/handtrainer/store';
import { HAND_TAGS, metaOf, TAG_COLORS, TAG_HINTS, TAG_LABELS, type DeckMeta } from '@/features/handtrainer/tags';
import { useSettings } from '@/features/settings/store';
import { colors, radius, spacing } from '@/theme';

import { TagToggle } from './TagViews';

/** Tag editor: assign roles to every main deck card and rank the starters. */
export function TagsTab({ deckId, mainDeck, meta, cards }: { deckId: string; mainDeck: number[]; meta: DeckMeta; cards: Map<number, Card> }) {
  const language = useSettings((s) => s.language);
  const { toggleTag, moveStarter, applySuggestions } = useDeckMeta.getState();
  const entries = useMemo(() => groupSection(mainDeck, cards, language), [mainDeck, cards, language]);
  const inDeck = useMemo(() => new Set(mainDeck), [mainDeck]);
  const starters = rankedStarters(meta, inDeck);
  const nameOf = (id: number) => {
    const card = cards.get(id);
    return card ? displayName(card, language) : `#${id}`;
  };
  const sequence = entries.map((e) => e.id);

  const suggest = async () => {
    const changed = await applySuggestions(deckId, entries.flatMap((e) => (e.card ? [e.card] : [])));
    showToast(changed > 0 ? `${changed} Karten getaggt – bitte prüfen.` : 'Keine bekannten Handtraps oder Board-Breaker ohne Tags gefunden.', changed > 0 ? 'success' : 'info');
  };

  return (
    <View style={styles.root}>
      <View style={styles.legend}>
        {HAND_TAGS.map((tag) => (
          <View key={tag} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: TAG_COLORS[tag] }]} />
            <AppText variant="small">
              <AppText style={styles.legendLabel}>{TAG_LABELS[tag]}</AppText> – {TAG_HINTS[tag]}
            </AppText>
          </View>
        ))}
        <Button testID="suggest-tags" label="Bekannte Handtraps & Board-Breaker vorschlagen" icon="sparkles-outline" size="sm" onPress={suggest} style={{ alignSelf: 'flex-start' }} />
      </View>

      <View style={styles.panel} testID="starter-ranking">
        <AppText variant="label">Starter-Rangliste</AppText>
        <AppText variant="small">Die oberste Karte gilt im Übungsmodus als bester Starter, wenn mehrere in der Hand sind.</AppText>
        {starters.length === 0 ? (
          <AppText variant="muted">Noch keine Starter getaggt.</AppText>
        ) : (
          starters.map((id, index) => (
            <View key={id} style={styles.rankRow}>
              <AppText style={styles.rank}>{index + 1}.</AppText>
              <AppText style={{ flex: 1 }} numberOfLines={1}>
                {nameOf(id)}
              </AppText>
              <IconButton icon="arrow-up" label="Nach oben" size={18} disabled={index === 0} onPress={() => moveStarter(deckId, starters, id, -1)} testID={`starter-up-${id}`} />
              <IconButton icon="arrow-down" label="Nach unten" size={18} disabled={index === starters.length - 1} onPress={() => moveStarter(deckId, starters, id, 1)} />
            </View>
          ))
        )}
      </View>

      <View style={styles.list}>
        {entries.map(({ id, card, count }) => (
          <View key={id} style={styles.cardRow} testID={`tag-row-${id}`}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={nameOf(id)}
              onPress={() => openCardDetail(id, { sequence })}
              style={({ pressed }) => [styles.cardInfo, pressed && { opacity: 0.7 }]}>
              <CardImage imageId={card?.imageIds[0] ?? id} size="small" width={40} name={card ? nameOf(id) : undefined} frameType={card?.frameType} />
              <View style={{ flex: 1 }}>
                <AppText numberOfLines={2} style={{ fontWeight: '700' }}>
                  {nameOf(id)}
                </AppText>
                <AppText variant="small">{count}× im Deck</AppText>
              </View>
            </Pressable>
            <View style={styles.toggles}>
              {HAND_TAGS.map((tag) => (
                <TagToggle key={tag} tag={tag} active={metaOf(meta, id).tags.includes(tag)} onPress={() => toggleTag(deckId, id, tag)} testID={`tag-${tag}-${id}`} />
              ))}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.lg },
  legend: { gap: 6, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  legendLabel: { color: colors.text, fontWeight: '700', fontSize: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  panel: { gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rank: { width: 28, fontWeight: '800', color: colors.textMuted },
  list: { gap: spacing.sm },
  cardRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  cardInfo: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexGrow: 1, flexBasis: 220 },
  toggles: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
