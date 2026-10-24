import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CardImage } from '@/components/cards/CardImage';
import { AppText } from '@/components/ui/AppText';
import { Button, IconButton } from '@/components/ui/Button';
import { confirmDialog, promptDialog, showToast } from '@/components/ui/dialogs';
import { Screen } from '@/components/ui/Screen';
import { useCards } from '@/features/cards/useCards';
import { exportDeckFile } from '@/features/decks/exporter';
import { useDecks } from '@/features/decks/store';
import type { Deck } from '@/features/decks/types';
import { validateDeck } from '@/features/decks/validation';
import { useSettings } from '@/features/settings/store';
import { formatDateTime } from '@/lib/text';
import { colors, radius, spacing } from '@/theme';

export default function DeckListScreen() {
  const decks = useDecks((s) => s.decks);
  const create = useDecks((s) => s.create);
  const banlist = useSettings((s) => s.banlist);
  const [width, setWidth] = useState(0);
  const allIds = useMemo(() => decks.flatMap((d) => [...d.main, ...d.extra, ...d.side]), [decks]);
  const cards = useCards(allIds);
  const columns = width >= 900 ? 3 : width >= 560 ? 2 : 1;
  const itemWidth = width > 0 ? (width - spacing.md * (columns - 1)) / columns : 0;

  const newDeck = async () => {
    const name = await promptDialog({ title: 'Neues Deck', placeholder: 'Deckname', confirmLabel: 'Erstellen' });
    if (!name) return;
    const deck = await create(name);
    router.push({ pathname: '/decks/[id]', params: { id: deck.id } });
  };

  return (
    <Screen>
      <View style={styles.toolbar}>
        <Button testID="new-deck" label="Neues Deck" icon="add" variant="primary" onPress={newDeck} />
        <Button testID="import-deck" label="Importieren" icon="download-outline" onPress={() => router.push('/decks/import')} />
      </View>

      {decks.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="albums-outline" size={56} color={colors.textFaint} />
          <AppText variant="title">Noch keine Decks</AppText>
          <AppText variant="muted" style={{ textAlign: 'center', maxWidth: 420 }}>
            Erstelle ein neues Deck über die Kartensuche oder importiere eine .ydk-Datei bzw. eine Deckliste.
          </AppText>
        </View>
      ) : (
        <View style={styles.grid} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
          {itemWidth > 0 ? decks.map((deck) => <DeckCard key={deck.id} deck={deck} width={itemWidth} valid={validateDeck(deck, cards, banlist).valid} />) : null}
        </View>
      )}
    </Screen>
  );
}

function DeckCard({ deck, width, valid }: { deck: Deck; width: number; valid: boolean }) {
  const { duplicate, remove, rename } = useDecks.getState();
  const cover = deck.main[0] ?? deck.extra[0] ?? null;

  const onRename = async () => {
    const name = await promptDialog({ title: 'Deck umbenennen', defaultValue: deck.name });
    if (name) await rename(deck.id, name);
  };
  const onDelete = async () => {
    const ok = await confirmDialog({
      title: 'Deck löschen?',
      message: `„${deck.name}“ wird endgültig gelöscht.`,
      confirmLabel: 'Löschen',
      destructive: true,
    });
    if (ok) {
      await remove(deck.id);
      showToast('Deck gelöscht');
    }
  };
  const onDuplicate = async () => {
    const copy = await duplicate(deck.id);
    if (copy) showToast(`„${copy.name}“ erstellt`, 'success');
  };

  return (
    <Pressable
      testID={`deck-${deck.id}`}
      onPress={() => router.push({ pathname: '/decks/[id]', params: { id: deck.id } })}
      style={({ pressed }) => [styles.deck, { width }, pressed && { backgroundColor: colors.surfaceAlt }]}>
      <CardImage imageId={cover} size="small" width={64} />
      <View style={styles.deckInfo}>
        <AppText variant="title" numberOfLines={1}>
          {deck.name}
        </AppText>
        <AppText variant="small">
          Main {deck.main.length} · Extra {deck.extra.length} · Side {deck.side.length}
        </AppText>
        <View style={styles.status}>
          <Ionicons name={valid ? 'checkmark-circle' : 'alert-circle'} size={15} color={valid ? colors.primary : colors.warning} />
          <AppText variant="small" style={{ color: valid ? colors.primary : colors.warning }}>
            {valid ? 'Turnierlegal' : 'Nicht legal'}
          </AppText>
          <AppText variant="small" style={{ color: colors.textFaint }}>
            · {formatDateTime(deck.updatedAt)}
          </AppText>
        </View>
        <View style={styles.actions}>
          <IconButton icon="create-outline" label="Umbenennen" size={19} onPress={onRename} />
          <IconButton icon="copy-outline" label="Duplizieren" size={19} onPress={onDuplicate} testID={`duplicate-${deck.id}`} />
          <IconButton icon="share-outline" label="Als .ydk exportieren" size={19} onPress={() => exportDeckFile(deck)} />
          <IconButton icon="trash-outline" label="Löschen" size={19} color={colors.danger} onPress={onDelete} testID={`delete-${deck.id}`} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  deck: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  deckInfo: { flex: 1, gap: 4 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  actions: { flexDirection: 'row', marginLeft: -8 },
  empty: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxl * 2 },
});
