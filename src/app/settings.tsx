import Constants from 'expo-constants';
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { CardDbPanel } from '@/components/CardDbPanel';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { confirmDialog, showToast } from '@/components/ui/dialogs';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Screen } from '@/components/ui/Screen';
import {
  cancelBulkDownload,
  clearImageCache,
  downloadImagesInBackground,
  getImageCacheStats,
  useImageBulk,
} from '@/features/cards/imageCache';
import { getAllCardIds, getCardsByIds } from '@/features/cards/repository';
import { useCardDb } from '@/features/cards/store';
import { useDecks } from '@/features/decks/store';
import { useSettings } from '@/features/settings/store';
import { formatBytes } from '@/lib/text';
import { colors, radius, spacing } from '@/theme';

export default function SettingsScreen() {
  const settings = useSettings();
  const bulk = useImageBulk();
  const cardCount = useCardDb((s) => s.cardCount);
  const [stats, setStats] = useState<{ count: number; bytes: number | null } | null>(null);

  const refreshStats = () => {
    getImageCacheStats()
      .then(setStats)
      .catch(() => setStats(null));
  };
  useEffect(refreshStats, [bulk.running]);

  const downloadDeckImages = async () => {
    const ids = [...new Set(useDecks.getState().decks.flatMap((d) => [...d.main, ...d.extra, ...d.side]))];
    if (ids.length === 0) {
      showToast('Noch keine Decks vorhanden.');
      return;
    }
    const cards = await getCardsByIds(ids);
    const imageIds = [...cards.values()].map((c) => c.imageIds[0]);
    downloadImagesInBackground(imageIds, 'small', 'Vorschaubilder der Decks').then(() =>
      downloadImagesInBackground(imageIds, 'full', 'Großbilder der Decks')
    );
  };

  const downloadAllThumbnails = async () => {
    const ok = await confirmDialog({
      title: 'Alle Vorschaubilder laden?',
      message: `Lädt ${cardCount.toLocaleString('de-DE')} kleine Kartenbilder (ca. 300–400 MB). Das dauert wegen des Rate-Limits etwa 30–45 Minuten. Die App bleibt dabei benutzbar; bitte im WLAN und mit geöffneter App durchführen.`,
      confirmLabel: 'Laden',
    });
    if (!ok) return;
    downloadImagesInBackground(await getAllCardIds(), 'small', 'Alle Vorschaubilder');
  };

  const clearCache = async () => {
    const ok = await confirmDialog({
      title: 'Bild-Cache leeren?',
      message: 'Alle gespeicherten Kartenbilder werden gelöscht und bei Bedarf neu geladen.',
      confirmLabel: 'Leeren',
      destructive: true,
    });
    if (!ok) return;
    await clearImageCache();
    refreshStats();
    showToast('Bild-Cache geleert');
  };

  return (
    <Screen maxWidth={820}>
      <Section title="Kartendatenbank">
        <CardDbPanel compact />
        <AppText variant="small">
          „Aktualisieren“ prüft zuerst die Datenbank-Version bei YGOPRODeck. Nur wenn es neue Karten gibt, wird alles neu geladen – sonst wird
          nur die aktuelle Banlist abgeglichen.
        </AppText>
        <Button label="Komplett neu laden" icon="cloud-download-outline" size="sm" style={{ alignSelf: 'flex-start' }} onPress={() => useCardDb.getState().sync(true)} />
      </Section>

      <Section title="Banlist für Deck-Prüfung">
        <View style={styles.row}>
          <Chip label="TCG (Europa/Amerika)" selected={settings.banlist === 'tcg'} onPress={() => settings.update({ banlist: 'tcg' })} />
          <Chip label="OCG (Asien)" selected={settings.banlist === 'ocg'} onPress={() => settings.update({ banlist: 'ocg' })} />
        </View>
      </Section>

      <Section title="Sprache der Kartentexte">
        <View style={styles.row}>
          <Chip label="Deutsch (Fallback Englisch)" selected={settings.language === 'de'} onPress={() => settings.update({ language: 'de' })} />
          <Chip label="Englisch" selected={settings.language === 'en'} onPress={() => settings.update({ language: 'en' })} />
        </View>
      </Section>

      <Section title="Kartenbilder (offline)">
        <AppText variant="muted">
          Bilder werden beim ersten Anzeigen einmalig von YGOPRODeck geladen und lokal gespeichert – danach nie wieder aus dem Netz.
        </AppText>
        <AppText testID="image-stats">
          {stats ? `${stats.count.toLocaleString('de-DE')} Bilder gespeichert${stats.bytes !== null ? ` · ${formatBytes(stats.bytes)}` : ''}` : '…'}
        </AppText>
        <View style={styles.row}>
          <Chip
            label="Großbilder für Deck-Karten automatisch laden"
            selected={settings.prefetchDeckImages}
            onPress={() => settings.update({ prefetchDeckImages: !settings.prefetchDeckImages })}
          />
        </View>
        {bulk.running ? (
          <View style={styles.bulk}>
            <AppText>
              {bulk.label}: {bulk.done} / {bulk.total}
              {bulk.failed ? ` (${bulk.failed} fehlgeschlagen)` : ''}
            </AppText>
            <ProgressBar value={bulk.total ? bulk.done / bulk.total : null} />
            <Button label="Abbrechen" icon="stop" size="sm" onPress={cancelBulkDownload} style={{ alignSelf: 'flex-start' }} />
          </View>
        ) : (
          <View style={styles.row}>
            <Button label="Bilder aller Decks laden" icon="albums-outline" size="sm" onPress={downloadDeckImages} disabled={cardCount === 0} />
            <Button label="Alle Vorschaubilder laden" icon="images-outline" size="sm" onPress={downloadAllThumbnails} disabled={cardCount === 0} />
            <Button label="Cache leeren" icon="trash-outline" size="sm" variant="danger" onPress={clearCache} />
          </View>
        )}
      </Section>

      <Section title="Über">
        <AppText variant="muted">
          YGO Trainer {Constants.expoConfig?.version ?? ''} – private Trainings-App, nicht zur Veröffentlichung bestimmt. Kartendaten und -bilder
          stammen von der YGOPRODeck-API (db.ygoprodeck.com). Yu-Gi-Oh! ist eine Marke von Konami; Kartenbilder sind urheberrechtlich geschützt.
        </AppText>
      </Section>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <AppText variant="label">{title}</AppText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  bulk: { gap: spacing.sm },
});
