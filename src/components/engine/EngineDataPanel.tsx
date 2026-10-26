import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { showToast } from '@/components/ui/dialogs';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { downloadEngineCards, refreshScripts, type DataProgress } from '@/features/engine/data';
import { engineCardCount, engineCardsUpdatedAt, scriptStats } from '@/features/engine/repository';
import { formatBytes, formatDateTime } from '@/lib/text';
import { colors, radius, spacing } from '@/theme';

type Info = { cards: number; updatedAt: number | null; scripts: number; bytes: number };

/** Status and update buttons for the rules engine's offline data. */
export function EngineDataPanel({ detailed = false }: { detailed?: boolean }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [progress, setProgress] = useState<DataProgress | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    Promise.all([engineCardCount(), engineCardsUpdatedAt(), scriptStats()])
      .then(([cards, updatedAt, scripts]) => setInfo({ cards, updatedAt, scripts: scripts.count, bytes: scripts.bytes }))
      .catch(() => undefined);
  };
  useEffect(load, []);

  const run = async (task: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await task();
      showToast(done, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setBusy(false);
      setProgress(null);
      load();
    }
  };

  const fraction = progress?.total ? progress.done / progress.total : null;

  return (
    <View style={styles.panel} testID="engine-data">
      <AppText variant="label">Regel-Engine</AppText>
      {info ? (
        <AppText testID="engine-data-status">
          {info.cards > 0
            ? `${info.cards.toLocaleString('de-DE')} Karten mit Regeldaten${info.updatedAt ? ` · Stand ${formatDateTime(info.updatedAt)}` : ''} · ${info.scripts} Skripte (${formatBytes(info.bytes)})`
            : 'Noch nicht geladen – beim ersten Duell lädt die App die Regel-Datenbank (ca. 8 MB) und die Skripte deiner Karten.'}
        </AppText>
      ) : null}
      {progress ? (
        <View style={{ gap: 4 }}>
          <AppText variant="small">
            {progress.label}
            {progress.total ? ` · ${progress.done}/${progress.total}` : ''}
          </AppText>
          <ProgressBar value={fraction} />
        </View>
      ) : null}
      <View style={styles.buttons}>
        <Button
          testID="engine-data-update"
          size="sm"
          icon="cloud-download-outline"
          label={info?.cards ? 'Regel-Datenbank aktualisieren' : 'Regel-Datenbank laden'}
          loading={busy}
          onPress={() => run(() => downloadEngineCards(setProgress), 'Regel-Datenbank aktualisiert')}
        />
        {detailed && info && info.scripts > 0 ? (
          <Button size="sm" icon="refresh" label="Skripte aktualisieren" disabled={busy} onPress={() => run(() => refreshScripts(setProgress), 'Skripte aktualisiert')} />
        ) : null}
      </View>
      {detailed ? (
        <AppText variant="small">
          Quelle: Project Ignis (EDOPro) – Kartendatenbank BabelCDB und Kartenskripte (CardScripts). Die Skripte werden für die Karten deiner Duelle geladen und
          offline gespeichert.
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
