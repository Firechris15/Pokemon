import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CardImage } from '@/components/cards/CardImage';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { openCardDetail } from '@/features/cards/detailStore';
import { displayName } from '@/features/cards/labels';
import { useCards } from '@/features/cards/useCards';
import { closeInstanceSheet, useInstanceSheet, type SheetRequest } from '@/features/duel/sheetStore';
import { useSettings } from '@/features/settings/store';
import { colors, radius, spacing } from '@/theme';

import { CardBack } from './DuelBoard';

const TILE = 92;

/** Global sheet for viewing piles and choosing cards on the duel field. */
export function InstanceSheet() {
  const request = useInstanceSheet((s) => s.request);
  return (
    <Modal visible={request !== null} animationType="slide" presentationStyle="pageSheet" transparent={false} onRequestClose={() => closeInstanceSheet(null)}>
      {request ? <SheetContent key={request.id} request={request} /> : null}
    </Modal>
  );
}

function SheetContent({ request }: { request: SheetRequest }) {
  const insets = useSafeAreaInsets();
  const language = useSettings((s) => s.language);
  const cards = useCards(request.items.map((i) => i.cardId));
  const [chosen, setChosen] = useState<string[]>([]);
  const valid = chosen.length >= request.min && chosen.length <= request.max;

  const tap = (uid: string) => {
    if (request.mode === 'view') {
      closeInstanceSheet([uid]);
      return;
    }
    setChosen((list) => (list.includes(uid) ? list.filter((u) => u !== uid) : request.max === 1 ? [uid] : list.length < request.max ? [...list, uid] : list));
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.sm }]} testID="instance-sheet">
      <View style={styles.header}>
        <Button label={request.mode === 'view' ? 'Schließen' : 'Abbrechen'} variant="ghost" onPress={() => closeInstanceSheet(null)} testID="sheet-close" />
        <View style={styles.titleBox}>
          <AppText variant="title" numberOfLines={1}>
            {request.title}
          </AppText>
          {request.mode === 'select' ? (
            <AppText variant="small">
              {request.min === request.max ? `${request.min} Karte${request.min === 1 ? '' : 'n'} wählen` : request.min === 0 ? `bis zu ${request.max} Karten` : `${request.min}–${request.max} Karten`}
            </AppText>
          ) : null}
        </View>
        {request.mode === 'select' ? (
          <Button testID="sheet-confirm" label={`Fertig (${chosen.length})`} variant="primary" disabled={!valid} onPress={() => closeInstanceSheet(chosen)} />
        ) : request.action ? (
          <Button testID="sheet-action" label={request.action} icon="add" variant="primary" onPress={() => closeInstanceSheet('action')} />
        ) : (
          <View style={{ width: 80 }} />
        )}
      </View>
      {request.message ? (
        <AppText variant="muted" style={styles.message}>
          {request.message}
        </AppText>
      ) : null}
      {request.items.length === 0 ? (
        <AppText variant="muted" style={styles.message}>
          Keine Karten.
        </AppText>
      ) : null}
      <ScrollView contentContainerStyle={styles.grid}>
        {request.items.map((item) => {
          const card = cards.get(item.cardId);
          const name = card ? displayName(card, language) : `#${item.cardId}`;
          const selected = chosen.includes(item.uid);
          return (
            <Pressable
              key={item.uid}
              testID={`sheet-item-${item.cardId}`}
              accessibilityLabel={item.faceDown ? 'Verdeckte Karte' : name}
              onPress={() => tap(item.uid)}
              onLongPress={item.faceDown ? undefined : () => openCardDetail(item.cardId)}
              style={({ pressed }) => [styles.item, selected && styles.selected, pressed && { opacity: 0.75 }]}>
              {item.faceDown ? <CardBack width={TILE} /> : <CardImage imageId={card?.imageIds[0] ?? item.cardId} size="small" width={TILE} name={name} frameType={card?.frameType} />}
              <AppText variant="small" numberOfLines={2} style={styles.caption}>
                {item.faceDown ? 'Verdeckt' : name}
              </AppText>
              <AppText variant="small" numberOfLines={1} style={styles.zone}>
                {item.caption}
              </AppText>
              {selected ? (
                <View style={styles.check}>
                  <Ionicons name="checkmark" size={16} color={colors.onPrimary} />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  titleBox: { flex: 1, alignItems: 'center' },
  message: { paddingHorizontal: spacing.lg, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, padding: spacing.lg, justifyContent: 'center' },
  item: { width: TILE + spacing.md, padding: spacing.xs, borderRadius: radius.md, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', gap: 2 },
  selected: { borderColor: colors.primary, backgroundColor: 'rgba(129,182,76,0.15)' },
  caption: { textAlign: 'center', color: colors.text },
  zone: { textAlign: 'center' },
  check: { position: 'absolute', top: 6, right: 6, backgroundColor: colors.primary, borderRadius: 12, padding: 2 },
});
