import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { ATTRIBUTE_LABELS, displayName, levelLabel, statsLabel, typeLineLabel } from '@/features/cards/labels';
import type { Card } from '@/features/cards/types';
import { useSettings } from '@/features/settings/store';
import { colors, radius, spacing } from '@/theme';

import { BanBadge } from './BanBadge';
import { CardImage } from './CardImage';

/** Compact row for search results: thumbnail, name, type line and actions. */
export const CardListItem = memo(function CardListItem({
  card,
  onPress,
  actions,
  testID,
}: {
  card: Card;
  onPress?: (card: Card) => void;
  actions?: ReactNode;
  testID?: string;
}) {
  const language = useSettings((s) => s.language);
  const banlist = useSettings((s) => s.banlist);
  const ban = banlist === 'ocg' ? card.banOcg : card.banTcg;
  const details = [
    card.attribute ? ATTRIBUTE_LABELS[card.attribute] : null,
    levelLabel(card),
    statsLabel(card),
  ].filter(Boolean);

  return (
    <View style={styles.row}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={displayName(card, language)}
        onPress={() => onPress?.(card)}
        style={({ pressed }) => [styles.main, pressed && { opacity: 0.7 }]}>
        <CardImage imageId={card.imageIds[0]} size="small" width={46} name={displayName(card, language)} frameType={card.frameType} />
        <View style={styles.text}>
          <View style={styles.nameRow}>
            <AppText numberOfLines={1} style={styles.name}>
              {displayName(card, language)}
            </AppText>
            <BanBadge status={ban} size={16} />
          </View>
          <AppText variant="small" numberOfLines={1}>
            {typeLineLabel(card)}
            {card.archetype ? `  ·  ${card.archetype}` : ''}
          </AppText>
          {details.length ? (
            <AppText variant="small" numberOfLines={1} style={{ color: colors.textFaint }}>
              {details.join('  ·  ')}
            </AppText>
          ) : null}
        </View>
      </Pressable>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  text: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontWeight: '700', flexShrink: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
