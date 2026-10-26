import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { displayName } from '@/features/cards/labels';
import type { Card } from '@/features/cards/types';
import { useSettings } from '@/features/settings/store';
import { colors, radius } from '@/theme';

import { BanBadge } from './BanBadge';
import { CardImage } from './CardImage';

type Props = {
  card: Card;
  width: number;
  count?: number;
  /** Highlights the tile, e.g. for validation errors. */
  flagged?: boolean;
  onPress?: (card: Card) => void;
  onLongPress?: (card: Card) => void;
  testID?: string;
};

/** Card picture with its name underneath; the standard way cards appear in grids. */
export const CardTile = memo(function CardTile({ card, width, count, flagged, onPress, onLongPress, testID }: Props) {
  const language = useSettings((s) => s.language);
  const banlist = useSettings((s) => s.banlist);
  const name = displayName(card, language);
  const ban = banlist === 'ocg' ? card.banOcg : card.banTcg;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={count && count > 1 ? `${count}x ${name}` : name}
      onPress={() => onPress?.(card)}
      onLongPress={onLongPress ? () => onLongPress(card) : undefined}
      style={({ pressed }) => [{ width }, styles.tile, pressed && styles.pressed]}>
      <View>
        <CardImage imageId={card.imageIds[0]} size="small" width={width} name={name} frameType={card.frameType} style={flagged && styles.flagged} />
        <View style={styles.badges}>
          <BanBadge status={ban} size={Math.max(16, width * 0.2)} />
        </View>
        {count && count > 1 ? (
          <View style={styles.count}>
            <Text style={styles.countText}>×{count}</Text>
          </View>
        ) : null}
      </View>
      <Text numberOfLines={2} style={[styles.name, { fontSize: width < 70 ? 10 : 11.5 }]}>
        {name}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  tile: { gap: 4 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  flagged: { borderWidth: 2, borderColor: colors.danger },
  badges: { position: 'absolute', top: 3, left: 3 },
  count: {
    position: 'absolute',
    right: 3,
    bottom: 3,
    backgroundColor: 'rgba(0,0,0,0.82)',
    borderRadius: radius.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  countText: { color: colors.text, fontWeight: '800', fontSize: 13 },
  name: { color: colors.text, fontWeight: '600', lineHeight: 14 },
});
