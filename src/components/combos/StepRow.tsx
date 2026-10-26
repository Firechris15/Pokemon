import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CardImage } from '@/components/cards/CardImage';
import { AppText } from '@/components/ui/AppText';
import { openCardDetail } from '@/features/cards/detailStore';
import type { Card } from '@/features/cards/types';
import { ACTION_LABELS, TARGET_LABELS } from '@/features/combos/actions';
import type { ComboStep } from '@/features/combos/types';
import { colors, radius, spacing } from '@/theme';

/** One step of a combo: number, card, action, related cards and the note. */
export function StepRow({
  step,
  index,
  cards,
  nameOf,
  status,
  errors,
  actions,
  showNote = true,
  testID,
}: {
  step: ComboStep;
  index: number;
  cards: Map<number, Card>;
  nameOf: (id: number) => string;
  status?: 'correct' | 'wrong' | null;
  errors?: number;
  actions?: ReactNode;
  showNote?: boolean;
  testID?: string;
}) {
  const card = cards.get(step.cardId);
  return (
    <View style={styles.row} testID={testID}>
      <View style={styles.index}>
        {status ? (
          <Ionicons name={status === 'correct' ? 'checkmark-circle' : 'close-circle'} size={22} color={status === 'correct' ? colors.primary : colors.danger} />
        ) : (
          <AppText style={styles.indexText}>{index + 1}</AppText>
        )}
      </View>
      <Pressable onPress={() => openCardDetail(step.cardId, { sequence: [step.cardId, ...step.targets] })} accessibilityLabel={nameOf(step.cardId)}>
        <CardImage imageId={card?.imageIds[0] ?? step.cardId} size="small" width={40} name={nameOf(step.cardId)} frameType={card?.frameType} />
      </Pressable>
      <View style={styles.text}>
        <AppText style={styles.title}>
          <AppText style={styles.action}>{ACTION_LABELS[step.action]}:</AppText> {nameOf(step.cardId)}
        </AppText>
        {step.targets.length > 0 ? (
          <AppText variant="small">
            {TARGET_LABELS[step.action]}: {step.targets.map(nameOf).join(', ')}
          </AppText>
        ) : null}
        {showNote && step.note ? (
          <AppText variant="small" style={styles.note}>
            {step.note}
          </AppText>
        ) : null}
        {errors ? (
          <AppText variant="small" style={{ color: colors.warning }}>
            {errors}× falsch beantwortet
          </AppText>
        ) : null}
      </View>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.sm },
  index: { width: 28, alignItems: 'center' },
  indexText: { fontWeight: '800', color: colors.textMuted },
  text: { flex: 1, gap: 2 },
  title: { fontWeight: '700' },
  action: { color: colors.textMuted, fontWeight: '700' },
  note: { fontStyle: 'italic', color: colors.textMuted },
  actions: { flexDirection: 'row', alignItems: 'center' },
});
