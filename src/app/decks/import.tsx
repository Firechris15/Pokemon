import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { showToast } from '@/components/ui/dialogs';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { findCardByName, getCardsByIds, resolvePasscodes } from '@/features/cards/repository';
import { useCardDb } from '@/features/cards/store';
import { readClipboardText } from '@/features/decks/exporter';
import { importDeckList, type ImportResult } from '@/features/decks/importer';
import { readPickedFile } from '@/features/decks/readPickedFile';
import { useDecks } from '@/features/decks/store';
import { colors, radius, spacing } from '@/theme';

const lookup = { resolvePasscodes, findCardByName, getCardsByIds };

const PLACEHOLDER = `Unterstützt:
• .ydk-Inhalt (#main / #extra / !side)
• ydke://…-Links
• Passcodes, eine pro Zeile
• Namen mit Anzahl, z. B. „3 Ash Blossom & Joyous Spring“`;

export default function ImportDeckScreen() {
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const cardCount = useCardDb((s) => s.cardCount);
  const create = useDecks((s) => s.create);
  const preview = text.trim() ? result : null;

  useEffect(() => {
    if (!text.trim()) return;
    let active = true;
    const timer = setTimeout(() => {
      importDeckList(text, lookup)
        .then((r) => {
          if (!active) return;
          setResult(r);
          if (r.name) setName((current) => current || r.name!);
        })
        .catch(() => active && setResult(null));
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [text]);

  const pickFile = async () => {
    const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (picked.canceled || !picked.assets?.[0]) return;
    const asset = picked.assets[0];
    try {
      const content = await readPickedFile(asset);
      setText(content);
      setName((current) => current || asset.name.replace(/\.ydk$/i, ''));
    } catch {
      showToast('Datei konnte nicht gelesen werden.', 'error');
    }
  };

  const paste = async () => {
    const clip = await readClipboardText();
    if (clip.trim()) setText(clip);
    else showToast('Die Zwischenablage ist leer.');
  };

  const save = async () => {
    if (!preview || preview.total === 0) return;
    setBusy(true);
    try {
      const deck = await create(name.trim() || 'Importiertes Deck', preview.cards);
      showToast(`Deck „${deck.name}“ importiert`, 'success');
      router.replace({ pathname: '/decks/[id]', params: { id: deck.id } });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen maxWidth={760}>
      {cardCount === 0 ? (
        <View style={[styles.box, { borderColor: colors.warning }]}>
          <AppText style={{ color: colors.warning }}>
            Die Kartendatenbank ist noch leer. Lade sie zuerst auf der Startseite herunter, damit Karten erkannt werden.
          </AppText>
        </View>
      ) : null}

      <View style={styles.row}>
        <Button testID="pick-file" label=".ydk-Datei wählen" icon="document-outline" variant="primary" onPress={pickFile} />
        <Button testID="paste-clipboard" label="Aus Zwischenablage" icon="clipboard-outline" onPress={paste} />
      </View>

      <TextField testID="import-text" multiline mono value={text} onChangeText={setText} placeholder={PLACEHOLDER} autoCapitalize="none" />

      <TextField testID="import-name" icon="albums-outline" value={name} onChangeText={setName} placeholder="Deckname" />

      {preview ? (
        <View style={styles.box} testID="import-preview">
          <AppText variant="label">Vorschau</AppText>
          <View style={styles.counts}>
            <Count label="Main" value={preview.cards.main.length} />
            <Count label="Extra" value={preview.cards.extra.length} />
            <Count label="Side" value={preview.cards.side.length} />
          </View>
          {preview.unknown.length > 0 ? (
            <View style={{ gap: 4 }}>
              <View style={styles.row}>
                <Ionicons name="warning" size={16} color={colors.warning} />
                <AppText style={{ color: colors.warning }}>{preview.unknown.length} Einträge nicht erkannt:</AppText>
              </View>
              {preview.unknown.slice(0, 12).map((u) => (
                <AppText key={`${u.line}-${u.text}`} variant="small">
                  Zeile {u.line}: {u.text}
                </AppText>
              ))}
              {preview.unknown.length > 12 ? <AppText variant="small">… und {preview.unknown.length - 12} weitere</AppText> : null}
            </View>
          ) : (
            <View style={styles.row}>
              <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
              <AppText style={{ color: colors.primary }}>Alle Karten erkannt</AppText>
            </View>
          )}
        </View>
      ) : null}

      <Button
        testID="import-save"
        label="Deck erstellen"
        icon="checkmark"
        variant="primary"
        size="lg"
        disabled={!preview || preview.total === 0}
        loading={busy}
        onPress={save}
      />
    </Screen>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.count}>
      <AppText variant="heading">{value}</AppText>
      <AppText variant="small">{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', flexWrap: 'wrap' },
  box: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  counts: { flexDirection: 'row', gap: spacing.xl },
  count: { alignItems: 'center' },
});
