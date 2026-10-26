import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { AppText } from '@/components/ui/AppText';
import { IconButton } from '@/components/ui/Button';
import { useCardDetail } from '@/features/cards/detailStore';
import {
  ATTRIBUTE_LABELS,
  BAN_LABELS,
  displayName,
  displayText,
  levelLabel,
  linkMarkerLabel,
  statsLabel,
  typeLineLabel,
} from '@/features/cards/labels';
import { getCachedCard, getCard } from '@/features/cards/repository';
import type { Card } from '@/features/cards/types';
import { useSettings } from '@/features/settings/store';
import { CARD_ASPECT, colors, frameColors, radius, spacing } from '@/theme';

import { BanBadge } from './BanBadge';
import { CardImage } from './CardImage';

const CLOSE_DISTANCE = 120;
const PAGE_DISTANCE = 90;

/**
 * Global large card view. Open it from anywhere with openCardDetail(id).
 * Closes by tapping outside, swiping down, the X button or Escape (web).
 * Swiping left/right pages through the card list it was opened from.
 */
export function CardDetailModal() {
  const cardId = useCardDetail((s) => s.cardId);
  const close = useCardDetail((s) => s.close);

  return (
    <Modal visible={cardId !== null} transparent animationType="fade" onRequestClose={close} supportedOrientations={['portrait', 'landscape']}>
      <GestureHandlerRootView style={styles.root}>{cardId !== null ? <DetailContent cardId={cardId} /> : null}</GestureHandlerRootView>
    </Modal>
  );
}

function DetailContent({ cardId }: { cardId: number }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const close = useCardDetail((s) => s.close);
  const step = useCardDetail((s) => s.step);
  const sequence = useCardDetail((s) => s.sequence);
  const Actions = useCardDetail((s) => s.Actions);
  const language = useSettings((s) => s.language);
  const banlist = useSettings((s) => s.banlist);
  const [loaded, setLoaded] = useState<{ id: number; card: Card | null } | null>(null);
  const [showEnglish, setShowEnglish] = useState(language === 'en');
  const card = getCachedCard(cardId) ?? (loaded?.id === cardId ? loaded.card : null);

  useEffect(() => {
    if (getCachedCard(cardId)) return;
    let active = true;
    getCard(cardId).then((result) => active && setLoaded({ id: cardId, card: result }));
    return () => {
      active = false;
    };
  }, [cardId]);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const canPage = sequence.length > 1;

  const pan = usePanGesture({
    minDistance: 12,
    onUpdate: (event) => {
      'worklet';
      translateX.value = canPage ? event.translationX : 0;
      translateY.value = Math.max(0, event.translationY);
    },
    onDeactivate: (event) => {
      'worklet';
      const horizontal = Math.abs(event.translationX) > Math.abs(event.translationY);
      if (!horizontal && (event.translationY > CLOSE_DISTANCE || event.velocityY > 1000)) {
        translateY.value = withTiming(800, { duration: 160 });
        scheduleOnRN(close);
        return;
      }
      if (canPage && horizontal && Math.abs(event.translationX) > PAGE_DISTANCE) {
        scheduleOnRN(step, event.translationX < 0 ? 1 : -1);
      }
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
    },
  });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
    opacity: 1 - Math.min(0.5, translateY.value / 600),
  }));

  // Escape closes, arrow keys page (hardware keyboard on iPad / desktop browser).
  useEffect(() => {
    if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
      if (event.key === 'ArrowRight') step(1);
      if (event.key === 'ArrowLeft') step(-1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close, step]);

  const wide = width >= 700 && width > height * 0.9;
  const availableHeight = height - insets.top - insets.bottom - spacing.xl * 2;
  const imageWidth = wide
    ? Math.min(availableHeight * CARD_ASPECT, width * 0.42, 520)
    : Math.min(width - spacing.xl * 2, (availableHeight * 0.5) * CARD_ASPECT, 360);

  const name = card ? displayName(card, language) : '';
  const otherName = card ? (language === 'de' ? card.nameEn : card.nameDe) : null;
  const text = card ? (showEnglish ? card.descEn : displayText(card, 'de')) : '';
  const ban = card ? (banlist === 'ocg' ? card.banOcg : card.banTcg) : null;

  const image = (
    <GestureDetector gesture={pan}>
      <View style={styles.imageColumn} testID="card-detail-image">
        <CardImage
          imageId={card?.imageIds[0] ?? cardId}
          size="full"
          fallbackSize="small"
          width={imageWidth}
          name={name}
          frameType={card?.frameType}
          style={styles.image}
        />
        {canPage ? (
          <View style={styles.pager}>
            <IconButton icon="chevron-back" label="Vorherige Karte" onPress={() => step(-1)} />
            <AppText variant="small">
              {sequence.indexOf(cardId) + 1} / {sequence.length}
            </AppText>
            <IconButton icon="chevron-forward" label="Nächste Karte" onPress={() => step(1)} />
          </View>
        ) : (
          <AppText variant="small" style={styles.hint}>
            Nach unten wischen zum Schließen
          </AppText>
        )}
      </View>
    </GestureDetector>
  );

  return (
    <View style={styles.root}>
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Kartenansicht schließen" testID="card-detail-backdrop" />
      <View pointerEvents="box-none" style={[styles.center, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }]}>
        <Animated.View
          testID="card-detail"
          style={[styles.sheet, wide ? styles.sheetWide : styles.sheetNarrow, { maxHeight: height - insets.top - insets.bottom - spacing.lg * 2 }, animatedStyle]}>
          <View style={styles.closeButton}>
            <IconButton icon="close" label="Schließen" onPress={close} testID="card-detail-close" />
          </View>
          {image}
          <ScrollView style={wide ? styles.infoWide : styles.infoNarrow} contentContainerStyle={styles.infoContent}>
            {card ? (
              <>
                <View style={styles.titleRow}>
                  <View style={{ flex: 1 }}>
                    <AppText variant="heading" selectable>
                      {name}
                    </AppText>
                    {otherName && otherName !== name ? (
                      <AppText variant="muted" selectable>
                        {otherName}
                      </AppText>
                    ) : null}
                  </View>
                  <BanBadge status={ban} size={26} />
                </View>

                <View style={styles.badges}>
                  <Badge label={typeLineLabel(card)} color={frameColors[card.frameType]} />
                  {card.attribute ? <Badge label={ATTRIBUTE_LABELS[card.attribute] ?? card.attribute} /> : null}
                  {levelLabel(card) ? <Badge label={levelLabel(card)!} /> : null}
                  {card.scale !== null ? <Badge label={`Pendelbereich ${card.scale}`} /> : null}
                  {statsLabel(card) ? <Badge label={statsLabel(card)!} strong /> : null}
                </View>

                {card.linkMarkers ? (
                  <AppText variant="small">Link-Pfeile: {card.linkMarkers.map(linkMarkerLabel).join(', ')}</AppText>
                ) : null}

                {card.archetype ? (
                  <View style={styles.row}>
                    <Ionicons name="pricetag" size={14} color={colors.accent} />
                    <AppText style={{ color: colors.accent, fontWeight: '600' }}>Archetyp: {card.archetype}</AppText>
                  </View>
                ) : null}

                <View style={styles.textBox}>
                  <AppText selectable style={styles.cardText}>
                    {text}
                  </AppText>
                  {card.descDe ? (
                    <Pressable onPress={() => setShowEnglish((v) => !v)} hitSlop={6}>
                      <AppText variant="small" style={{ color: colors.info }}>
                        {showEnglish ? 'Deutschen Text anzeigen' : 'Englischen Text anzeigen'}
                      </AppText>
                    </Pressable>
                  ) : (
                    <AppText variant="small">Kein deutscher Text verfügbar.</AppText>
                  )}
                </View>

                <View style={styles.metaGrid}>
                  <Meta label="Banlist TCG" value={card.banTcg ? BAN_LABELS[card.banTcg] : 'Unbegrenzt'} />
                  <Meta label="Banlist OCG" value={card.banOcg ? BAN_LABELS[card.banOcg] : 'Unbegrenzt'} />
                  <Meta label="Passcode" value={String(card.id)} />
                  <Meta label="Deck" value={card.isExtraDeck ? 'Extra Deck' : card.cardClass === 'token' ? '–' : 'Main Deck'} />
                </View>

                {Actions ? (
                  <View style={styles.actions}>
                    {/* eslint-disable-next-line react-hooks/static-components -- stable component handed over via the detail store */}
                    <Actions card={card} />
                  </View>
                ) : null}
              </>
            ) : (
              <AppText variant="muted">Karte {cardId} ist nicht in der lokalen Datenbank.</AppText>
            )}
          </ScrollView>
        </Animated.View>
      </View>
    </View>
  );
}

function Badge({ label, color, strong }: { label: string; color?: string; strong?: boolean }) {
  return (
    <View style={[styles.badge, color ? { borderColor: color } : null]}>
      {color ? <View style={[styles.badgeDot, { backgroundColor: color }]} /> : null}
      <AppText style={[styles.badgeText, strong && { color: colors.text, fontWeight: '800' }]}>{label}</AppText>
    </View>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.meta}>
      <AppText variant="label">{label}</AppText>
      <AppText selectable>{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.backdrop },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    width: '100%',
    maxWidth: 1150,
  },
  sheetWide: { flexDirection: 'row', padding: spacing.xl, gap: spacing.xl },
  sheetNarrow: { flexDirection: 'column', padding: spacing.lg, gap: spacing.md },
  closeButton: { position: 'absolute', top: spacing.sm, right: spacing.sm, zIndex: 2 },
  imageColumn: { alignItems: 'center', gap: spacing.sm },
  image: { shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
  pager: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  hint: { color: colors.textFaint },
  infoWide: { flex: 1 },
  infoNarrow: { flexShrink: 1 },
  infoContent: { gap: spacing.md, paddingRight: spacing.xl, paddingBottom: spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingRight: spacing.xl },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: colors.surfaceAlt,
  },
  badgeDot: { width: 8, height: 8, borderRadius: 4 },
  badgeText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  textBox: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.lg, gap: spacing.sm },
  cardText: { lineHeight: 22 },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  meta: { minWidth: 120, gap: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingTop: spacing.sm },
});
