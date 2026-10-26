import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureDetector, useCompetingGestures, useLongPressGesture, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { CardImage } from '@/components/cards/CardImage';
import { openCardDetail } from '@/features/cards/detailStore';
import type { Card } from '@/features/cards/types';
import { statsOf } from '@/features/duel/battle';
import { locate } from '@/features/duel/state';
import type { CardInstance, DuelState, Location, PileZone, Side } from '@/features/duel/types';
import { CARD_ASPECT, colors, radius } from '@/theme';

import { computeLayout, handPositions, hitTest, type Rect, type ZoneSpot } from './layout';

type Props = {
  state: DuelState;
  cards: Map<number, Card>;
  width: number;
  height: number;
  /** Drag & drop of a card onto a zone. */
  onDrop?: (uid: string, target: Location) => void;
  onCardPress?: (uid: string) => void;
  onPilePress?: (side: Side, zone: PileZone) => void;
  /** Tap on an empty zone or a hand row (editor: add cards). */
  onZonePress?: (target: Location) => void;
  /** Show face-down and hidden opponent cards (editor). */
  revealAll?: boolean;
  /** Cards touched by the last move. */
  highlight?: ReadonlySet<string>;
};

type DragState = { uid: string; cardId: number; face: boolean; rect: Rect };

/**
 * Duel field with every zone of both players. Cards can be dragged with a
 * finger, mouse or Apple Pencil, tapped for an action menu and long-pressed
 * for the card details.
 */
export function DuelBoard({ state, cards, width, height, onDrop, onCardPress, onPilePress, onZonePress, revealAll = false, highlight }: Props) {
  const layout = computeLayout(width, height);
  const rects = layout.spots.map((s) => s.rect);
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const hover = useSharedValue(-1);
  const [drag, setDrag] = useState<DragState | null>(null);

  const canSee = (card: CardInstance, side: Side, zone: Location['zone']) => {
    if (revealAll || (side === 'me' && zone !== 'deck' && zone !== 'extra')) return true;
    if (zone === 'hand') return card.revealed;
    if (zone === 'deck' || zone === 'extra') return false;
    return card.faceUp || card.revealed;
  };

  const startDrag = (uid: string, x: number, y: number, w: number, face: boolean) => {
    const found = locate(state, uid);
    if (found) setDrag({ uid, cardId: found.card.cardId, face, rect: { x, y, w, h: w / CARD_ASPECT } });
  };
  const endDrag = (uid: string, x: number, y: number) => {
    setDrag(null);
    const index = hitTest(rects, x, y);
    const found = locate(state, uid);
    if (index < 0 || !found || !onDrop) return;
    let target = layout.spots[index].loc;
    if (target.zone === 'emz') target = { ...target, side: state.emz[target.index!]?.owner ?? found.loc.side };
    const same = target.zone === found.loc.zone && target.side === found.loc.side && (target.index === undefined || target.index === found.loc.index);
    if (!same) onDrop(uid, target);
  };
  const finishDrag = () => setDrag(null);
  const showDetail = (cardId: number) => openCardDetail(cardId);

  const handlers: Handlers = {
    enabled: Boolean(onDrop),
    dragX,
    dragY,
    hover,
    rects,
    onStart: startDrag,
    onEnd: endDrag,
    onFinish: finishDrag,
    onLongPress: showDetail,
  };

  const renderCard = (card: CardInstance, side: Side, zone: Location['zone'], rect: Rect, cardW: number, extra: { onPress?: () => void; draggable?: boolean; testID?: string } = {}) => {
    const data = cards.get(card.cardId);
    const face = canSee(card, side, zone);
    const onBoard = zone === 'monster' || zone === 'emz';
    let stats: string | null = null;
    let changed = false;
    if (onBoard && face && data?.cardClass === 'monster') {
      const s = statsOf(card, (id) => cards.get(id));
      stats = data.linkVal !== null ? `${s.atk}` : `${s.atk}/${s.def}`;
      changed = card.atk !== null || card.def !== null;
    }
    return (
      <BoardCard
        key={card.uid}
        uid={card.uid}
        cardId={card.cardId}
        data={data}
        rect={rect}
        cardW={cardW}
        face={face}
        dim={face && !card.faceUp && (zone === 'monster' || zone === 'emz' || zone === 'spell' || zone === 'field')}
        defense={card.defense && (zone === 'monster' || zone === 'emz')}
        stats={stats}
        statsChanged={changed}
        materials={card.materials.length}
        highlighted={highlight?.has(card.uid) ?? false}
        handlers={handlers}
        draggable={extra.draggable ?? true}
        onPress={extra.onPress ?? (onCardPress ? () => onCardPress(card.uid) : undefined)}
        testID={extra.testID ?? `duel-card-${card.cardId}`}
      />
    );
  };

  const pileCard = (spot: ZoneSpot) => {
    const zone = spot.loc.zone as PileZone;
    const list = state[spot.loc.side][zone];
    const top = list[list.length - 1];
    if (!top) return null;
    return [
      renderCard(top, spot.loc.side, zone, spot.rect, layout.cardW, {
        onPress: onPilePress ? () => onPilePress(spot.loc.side, zone) : undefined,
        draggable: zone === 'gy' || zone === 'banished' || revealAll,
        testID: `pile-top-${spot.key}`,
      }),
      <View key={`count-${spot.key}`} pointerEvents="none" style={[styles.abs, styles.count, { left: spot.rect.x + spot.rect.w - 30, top: spot.rect.y + spot.rect.h - 22 }]}>
        <Text style={styles.countText} testID={`pile-count-${spot.key}`}>
          {list.length}
        </Text>
      </View>,
    ];
  };

  return (
    <View style={{ width: layout.width, height: layout.height }} testID="duel-board">
      <LpBar side="opp" lp={state.opp.lp} rect={layout.lp.opp} />
      <LpBar side="me" lp={state.me.lp} rect={layout.lp.me} />

      {layout.spots.map((spot, index) => (
        <ZoneOutline
          key={spot.key}
          spot={spot}
          index={index}
          hover={hover}
          onPress={
            spot.kind === 'pile'
              ? onPilePress
                ? () => onPilePress(spot.loc.side, spot.loc.zone as PileZone)
                : undefined
              : onZonePress
                ? () => onZonePress(spot.loc)
                : undefined
          }
        />
      ))}

      {layout.spots.map((spot) => {
        if (spot.kind === 'pile') return pileCard(spot);
        if (spot.kind === 'hand') {
          const hand = state[spot.loc.side].hand;
          const xs = handPositions(hand.length, spot.rect, layout.handCardW);
          const cardH = layout.handCardW / CARD_ASPECT;
          return hand.map((card, i) =>
            renderCard(card, spot.loc.side, 'hand', { x: xs[i], y: spot.rect.y + (spot.rect.h - cardH) / 2, w: layout.handCardW, h: cardH }, layout.handCardW, {
              testID: `hand-${spot.loc.side}-${card.cardId}`,
            })
          );
        }
        const card = spot.loc.zone === 'emz' ? state.emz[spot.loc.index!] : state[spot.loc.side][spot.loc.zone as 'monster' | 'spell' | 'field'][spot.loc.index!];
        if (!card) return null;
        const side = spot.loc.zone === 'emz' ? card.owner : spot.loc.side;
        return renderCard(card, side, spot.loc.zone, spot.rect, layout.cardW);
      })}

      {drag ? <DragOverlay drag={drag} cards={cards} dragX={dragX} dragY={dragY} /> : null}
    </View>
  );
}

type Handlers = {
  enabled: boolean;
  dragX: SharedValue<number>;
  dragY: SharedValue<number>;
  hover: SharedValue<number>;
  rects: Rect[];
  onStart: (uid: string, x: number, y: number, w: number, face: boolean) => void;
  onEnd: (uid: string, x: number, y: number) => void;
  onFinish: () => void;
  onLongPress: (cardId: number) => void;
};

const rectStyle = (r: Rect) => ({ left: r.x, top: r.y, width: r.w, height: r.h });

function BoardCard({
  uid,
  cardId,
  data,
  rect,
  cardW,
  face,
  dim,
  defense,
  stats,
  statsChanged,
  materials,
  highlighted,
  handlers,
  draggable,
  onPress,
  testID,
}: {
  uid: string;
  cardId: number;
  data: Card | undefined;
  rect: Rect;
  cardW: number;
  face: boolean;
  dim: boolean;
  defense: boolean;
  stats: string | null;
  statsChanged: boolean;
  materials: number;
  highlighted: boolean;
  handlers: Handlers;
  draggable: boolean;
  onPress?: () => void;
  testID: string;
}) {
  const { dragX, dragY, hover, rects, onStart, onEnd, onFinish, onLongPress } = handlers;
  const enabled = handlers.enabled && draggable;
  const originX = rect.x;
  const originY = rect.y;
  const overlayW = Math.max(cardW, 56);
  const overlayX = rect.x + (rect.w - overlayW) / 2;
  const overlayY = rect.y + (rect.h - overlayW / CARD_ASPECT) / 2;
  const showDetail = () => {
    if (face) onLongPress(cardId);
  };
  const press = () => onPress?.();

  const pan = usePanGesture({
    enabled,
    minDistance: 8,
    onActivate: () => {
      'worklet';
      dragX.set(0);
      dragY.set(0);
      scheduleOnRN(onStart, uid, overlayX, overlayY, overlayW, face);
    },
    onUpdate: (event) => {
      'worklet';
      dragX.set(event.translationX);
      dragY.set(event.translationY);
      hover.set(hitTest(rects, originX + event.x, originY + event.y));
    },
    onDeactivate: (event) => {
      'worklet';
      hover.set(-1);
      scheduleOnRN(onEnd, uid, originX + event.x, originY + event.y);
    },
    onFinalize: () => {
      'worklet';
      hover.set(-1);
      scheduleOnRN(onFinish);
    },
  });
  const tap = useTapGesture({
    onActivate: () => {
      'worklet';
      scheduleOnRN(press);
    },
  });
  const longPress = useLongPressGesture({
    // Long enough that a slow start of a drag (finger or Pencil) is not taken as a long press.
    minDuration: 600,
    onActivate: () => {
      'worklet';
      scheduleOnRN(showDetail);
    },
  });
  const gesture = useCompetingGestures(pan, longPress, tap);
  const cardH = cardW / CARD_ASPECT;

  return (
    <GestureDetector gesture={gesture}>
      <View testID={testID} accessibilityLabel={face ? (data?.nameEn ?? `#${cardId}`) : 'Verdeckte Karte'} style={[styles.abs, styles.center, rectStyle(rect)]}>
        <View style={[defense && { transform: [{ rotate: '90deg' }] }, highlighted && styles.highlight, { borderRadius: radius.sm }]}>
          {face ? (
            <View style={dim && styles.dim}>
              <CardImage imageId={data?.imageIds[0] ?? cardId} size="small" width={cardW} name={data?.nameEn ?? `#${cardId}`} frameType={data?.frameType} />
            </View>
          ) : (
            <CardBack width={cardW} />
          )}
        </View>
        {stats ? (
          <View pointerEvents="none" style={[styles.stats, { top: rect.h / 2 + Math.min(cardH, rect.h) / 2 - 14 }]}>
            <Text style={[styles.statsText, statsChanged && { color: colors.accent }]}>{stats}</Text>
          </View>
        ) : null}
        {materials > 0 ? (
          <View pointerEvents="none" style={styles.materials}>
            <Text style={styles.countText}>+{materials}</Text>
          </View>
        ) : null}
      </View>
    </GestureDetector>
  );
}

export function CardBack({ width }: { width: number }) {
  return (
    <View style={[styles.back, { width, height: width / CARD_ASPECT, borderRadius: Math.max(3, width * 0.05) }]}>
      <View style={[styles.backOval, { width: width * 0.6, height: width * 0.8, borderRadius: width }]} />
    </View>
  );
}

function ZoneOutline({ spot, index, hover, onPress }: { spot: ZoneSpot; index: number; hover: SharedValue<number>; onPress?: () => void }) {
  const animated = useAnimatedStyle(() => ({
    borderColor: hover.value === index ? colors.primary : spot.kind === 'hand' ? 'transparent' : 'rgba(255,255,255,0.12)',
    backgroundColor: hover.value === index ? 'rgba(129,182,76,0.22)' : spot.kind === 'hand' ? 'transparent' : 'rgba(255,255,255,0.035)',
  }));
  const inset = spot.kind === 'hand' ? 0 : 3;
  const style = [styles.abs, styles.zone, { left: spot.rect.x + inset, top: spot.rect.y + inset, width: spot.rect.w - inset * 2, height: spot.rect.h - inset * 2 }];
  const label = spot.label ? <Text style={styles.zoneLabel}>{spot.label}</Text> : null;
  if (!onPress) {
    return (
      <Animated.View pointerEvents="none" style={[style, animated]} testID={`zone-${spot.key}`}>
        {label}
      </Animated.View>
    );
  }
  return (
    <Animated.View style={[style, animated]} testID={`zone-${spot.key}`}>
      <Pressable accessibilityLabel={spot.label || spot.key} onPress={onPress} style={styles.zonePress}>
        {label}
      </Pressable>
    </Animated.View>
  );
}

function LpBar({ side, lp, rect }: { side: Side; lp: number; rect: Rect }) {
  const fraction = Math.max(0, Math.min(1, lp / 8000));
  return (
    <View style={[styles.abs, styles.lp, rectStyle(rect)]} testID={`lp-${side}`}>
      <Text style={styles.lpName}>{side === 'me' ? 'Du' : 'Gegner'}</Text>
      <View style={styles.lpTrack}>
        <View style={[styles.lpFill, { width: `${fraction * 100}%`, backgroundColor: side === 'me' ? colors.primary : colors.danger }]} />
      </View>
      <Text style={styles.lpValue} testID={`lp-${side}-value`}>
        {lp} LP
      </Text>
    </View>
  );
}

function DragOverlay({ drag, cards, dragX, dragY }: { drag: DragState; cards: Map<number, Card>; dragX: SharedValue<number>; dragY: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: dragX.value }, { translateY: dragY.value }, { scale: 1.08 }] }));
  const data = cards.get(drag.cardId);
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, styles.overlay, { left: drag.rect.x, top: drag.rect.y }, style]}>
      {drag.face ? <CardImage imageId={data?.imageIds[0] ?? drag.cardId} size="small" width={drag.rect.w} name={data?.nameEn} frameType={data?.frameType} /> : <CardBack width={drag.rect.w} />}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  center: { alignItems: 'center', justifyContent: 'center' },
  zone: { borderWidth: 1, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  zonePress: { alignSelf: 'stretch', flex: 1, alignItems: 'center', justifyContent: 'center' },
  zoneLabel: { color: colors.textFaint, fontSize: 10, textAlign: 'center' },
  highlight: { borderWidth: 2, borderColor: colors.accent, margin: -2 },
  dim: { opacity: 0.55 },
  back: { backgroundColor: '#5a3416', borderWidth: 2, borderColor: '#b07a32', alignItems: 'center', justifyContent: 'center' },
  backOval: { backgroundColor: '#2b1a0c', borderWidth: 1, borderColor: '#d9a54a' },
  stats: { position: 'absolute', alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.78)', borderRadius: 4, paddingHorizontal: 4 },
  statsText: { color: colors.text, fontSize: 10, fontWeight: '700' },
  count: { minWidth: 26, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.8)', borderRadius: 8, paddingHorizontal: 5 },
  countText: { color: colors.text, fontSize: 11, fontWeight: '700' },
  materials: { position: 'absolute', left: 4, top: 4, backgroundColor: colors.info, borderRadius: 8, paddingHorizontal: 5 },
  lp: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  lpName: { color: colors.textMuted, fontSize: 12, fontWeight: '700', width: 52 },
  lpTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
  lpFill: { height: 6, borderRadius: 3 },
  lpValue: { color: colors.text, fontSize: 14, fontWeight: '800', minWidth: 72, textAlign: 'right' },
  overlay: { zIndex: 50, shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } },
});
