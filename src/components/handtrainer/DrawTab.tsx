import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { displayName } from '@/features/cards/labels';
import type { Card } from '@/features/cards/types';
import { classifyHand } from '@/features/handtrainer/classify';
import { handSize, PLAYABLE_RULE } from '@/features/handtrainer/stats';
import { metaOf, TAG_COLORS, TAG_LABELS, type DeckMeta, type HandTag } from '@/features/handtrainer/tags';
import { useSettings } from '@/features/settings/store';
import { shuffled } from '@/lib/random';
import { colors, radius, spacing } from '@/theme';

import { HandCards } from './HandCards';
import { TagBadges } from './TagViews';

/** Draws random opening hands from the main deck and shows the tag summary. */
export function DrawTab({
  mainDeck,
  meta,
  cards,
  goingFirst,
  width,
}: {
  mainDeck: number[];
  meta: DeckMeta;
  cards: Map<number, Card>;
  goingFirst: boolean;
  width: number;
}) {
  const language = useSettings((s) => s.language);
  const [order, setOrder] = useState<number[]>(() => shuffled(mainDeck));
  const [extra, setExtra] = useState(0);
  const size = handSize(goingFirst);
  const hand = order.slice(0, size + extra);
  const remaining = Math.max(0, order.length - hand.length);
  const anyTags = Object.keys(meta).length > 0;
  const classification = useMemo(() => classifyHand(hand, meta, goingFirst), [hand, meta, goingFirst]);
  const nameOf = (id: number) => {
    const card = cards.get(id);
    return card ? displayName(card, language) : `#${id}`;
  };

  const newHand = () => {
    setOrder(shuffled(mainDeck));
    setExtra(0);
  };

  const counts: { tag: HandTag; ids: number[] }[] = [
    { tag: 'starter', ids: classification.starters },
    { tag: 'extender', ids: classification.extenders },
    { tag: 'handtrap', ids: classification.handtraps },
    { tag: 'brick', ids: classification.bricks },
    { tag: 'breaker', ids: classification.breakers },
  ];
  const copiesInHand = (ids: number[]) => hand.filter((id) => ids.includes(id)).length;

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <Button testID="draw-new-hand" label="Neue Hand" icon="shuffle" variant="primary" onPress={newHand} />
        <Button testID="draw-one" label="+1 Karte ziehen" icon="add" onPress={() => setExtra((e) => e + 1)} disabled={remaining === 0} />
        <AppText variant="small">
          {goingFirst ? 'Als Erster: 5 Karten' : 'Als Zweiter: 5 Karten + 1 Ziehung'} · noch {remaining} im Deck
        </AppText>
      </View>

      <HandCards
        hand={hand}
        cards={cards}
        width={width}
        footer={(id, index) => (
          <View style={{ gap: 4 }}>
            {index >= size ? <AppText variant="small">Gezogen ({index - size + 1})</AppText> : null}
            <TagBadges tags={metaOf(meta, id).tags} compact />
          </View>
        )}
      />

      {anyTags ? (
        <View style={styles.summary} testID="draw-summary">
          <View style={styles.verdict}>
            <Ionicons
              name={classification.playable ? 'checkmark-circle' : 'close-circle'}
              size={22}
              color={classification.playable ? colors.primary : colors.danger}
            />
            <AppText style={{ fontWeight: '700' }}>
              {classification.playable ? 'Spielbar' : 'Nicht spielbar'}
              {classification.best !== null ? ` – beste Wahl: ${nameOf(classification.best)}` : ''}
            </AppText>
          </View>
          <View style={styles.countRow}>
            {counts.map(({ tag, ids }) => (
              <View key={tag} style={styles.count}>
                <View style={[styles.dot, { backgroundColor: TAG_COLORS[tag] }]} />
                <AppText variant="small">
                  {TAG_LABELS[tag]}: <AppText style={styles.countValue}>{copiesInHand(ids)}</AppText>
                </AppText>
              </View>
            ))}
          </View>
          <AppText variant="small">{goingFirst ? PLAYABLE_RULE.first : PLAYABLE_RULE.second}</AppText>
        </View>
      ) : (
        <AppText variant="muted">Tipp: Vergib im Reiter „Tags“ Starter, Handtraps und Bricks – dann wertet die App jede Hand aus.</AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.lg },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  summary: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  verdict: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  countRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  count: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  countValue: { color: colors.text, fontWeight: '800' },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
