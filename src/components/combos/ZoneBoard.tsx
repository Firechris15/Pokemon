import { StyleSheet, View } from 'react-native';

import { CardTile } from '@/components/cards/CardTile';
import { AppText } from '@/components/ui/AppText';
import { openCardDetail } from '@/features/cards/detailStore';
import type { Card } from '@/features/cards/types';
import { BOARD_ZONES, ZONE_LABELS } from '@/features/combos/actions';
import type { BoardState } from '@/features/combos/state';
import { colors, radius, spacing } from '@/theme';

/** Current combo state: hand, field, Xyz materials, GY and banished cards. */
export function ZoneBoard({ board, cards, tileWidth = 64 }: { board: BoardState; cards: Map<number, Card>; tileWidth?: number }) {
  const sequence = [...new Set(BOARD_ZONES.flatMap((zone) => board[zone]))];
  return (
    <View style={styles.board} testID="zone-board">
      {BOARD_ZONES.map((zone) => {
        const ids = board[zone];
        if ((zone === 'material' || zone === 'banished') && ids.length === 0) return null;
        return (
          <View key={zone} style={styles.zone} testID={`zone-${zone}`}>
            <View style={styles.zoneHeader}>
              <AppText variant="label">{ZONE_LABELS[zone]}</AppText>
              <AppText variant="small">{ids.length}</AppText>
            </View>
            {ids.length === 0 ? (
              <AppText variant="small" style={styles.empty}>
                leer
              </AppText>
            ) : (
              <View style={styles.cards}>
                {ids.map((id, index) => {
                  const card = cards.get(id);
                  return card ? (
                    <CardTile key={`${id}-${index}`} card={card} width={tileWidth} onPress={() => openCardDetail(id, { sequence })} />
                  ) : (
                    <View key={`${id}-${index}`} style={[styles.unknown, { width: tileWidth }]}>
                      <AppText variant="small">#{id}</AppText>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  board: { gap: spacing.md },
  zone: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  zoneHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  empty: { color: colors.textFaint },
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
