import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { CardTile } from '@/components/cards/CardTile';
import { AppText } from '@/components/ui/AppText';
import { openCardDetail, type CardActionsComponent } from '@/features/cards/detailStore';
import type { Card } from '@/features/cards/types';
import { colors, radius, spacing } from '@/theme';

export type CardHighlight = 'best' | 'wrong' | 'selected' | null;

const HIGHLIGHT_COLORS: Record<Exclude<CardHighlight, null>, string> = {
  best: colors.primary,
  wrong: colors.danger,
  selected: colors.info,
};

/**
 * A hand of cards laid out in one row on iPad (wrapping on phones).
 * Tapping a card opens the large view; `footer` renders below each card.
 */
export function HandCards({
  hand,
  cards,
  width,
  footer,
  highlight,
  detailActions,
}: {
  hand: number[];
  cards: Map<number, Card>;
  width: number;
  footer?: (cardId: number, index: number) => ReactNode;
  highlight?: (cardId: number, index: number) => CardHighlight;
  detailActions?: CardActionsComponent;
}) {
  const gap = spacing.md;
  const perRow = width >= 900 ? Math.max(hand.length, 5) : width >= 560 ? 4 : 3;
  const tileWidth = Math.min(170, (width - gap * (perRow - 1)) / perRow);
  const sequence = [...new Set(hand)];

  return (
    <View style={[styles.row, { gap }]} testID="hand-cards">
      {hand.map((id, index) => {
        const card = cards.get(id);
        const mark = highlight?.(id, index) ?? null;
        return (
          <View key={`${id}-${index}`} style={{ width: tileWidth, gap: 6 }} testID={`hand-card-${index}`}>
            <View style={[styles.frame, mark ? { borderColor: HIGHLIGHT_COLORS[mark] } : null]}>
              {card ? (
                <CardTile card={card} width={tileWidth - 8} onPress={() => openCardDetail(id, { sequence, actions: detailActions })} />
              ) : (
                <View style={[styles.unknown, { width: tileWidth - 8 }]}>
                  <AppText variant="small">#{id}</AppText>
                </View>
              )}
            </View>
            {footer?.(id, index)}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  frame: { borderWidth: 2, borderColor: 'transparent', borderRadius: radius.md, padding: 2 },
  unknown: {
    aspectRatio: 0.69,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
