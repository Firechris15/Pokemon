import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { openCardDetail } from '@/features/cards/detailStore';
import type { Card } from '@/features/cards/types';
import { colors, radius, spacing } from '@/theme';

import { CardTile } from './CardTile';

/**
 * Grid of cards where a tap *chooses* the card (pickers, free quiz answers).
 * The small info button still opens the large card view.
 */
export function CardChoiceGrid({
  ids,
  cards,
  width,
  tileWidth = 84,
  selected,
  onChoose,
  testIDPrefix = 'choice',
}: {
  ids: number[];
  cards: Map<number, Card>;
  width: number;
  tileWidth?: number;
  selected?: (id: number) => boolean;
  onChoose: (id: number) => void;
  testIDPrefix?: string;
}) {
  const gap = spacing.sm;
  const columns = Math.max(3, Math.floor((width + gap) / (tileWidth + gap)));
  const tile = (width - gap * (columns - 1)) / columns;
  const unique = [...new Set(ids)];

  return (
    <View style={[styles.grid, { gap }]}>
      {unique.map((id) => {
        const card = cards.get(id);
        const isSelected = selected?.(id) ?? false;
        return (
          <View key={id} style={{ width: tile }} testID={`${testIDPrefix}-${id}`}>
            <View style={[styles.frame, isSelected && styles.frameSelected]}>
              {card ? (
                <CardTile card={card} width={tile - 6} onPress={() => onChoose(id)} />
              ) : (
                <Pressable onPress={() => onChoose(id)} style={[styles.unknown, { width: tile - 6 }]}>
                  <AppText variant="small">#{id}</AppText>
                </Pressable>
              )}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Karte groß anzeigen"
              hitSlop={6}
              onPress={() => openCardDetail(id, { sequence: unique })}
              style={styles.info}>
              <Ionicons name="information-circle" size={22} color={colors.text} />
            </Pressable>
            {isSelected ? (
              <View style={styles.check}>
                <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  frame: { borderWidth: 2, borderColor: 'transparent', borderRadius: radius.md, padding: 1 },
  frameSelected: { borderColor: colors.primary },
  info: { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12 },
  check: { position: 'absolute', top: 4, left: 4, backgroundColor: colors.bg, borderRadius: 12 },
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
