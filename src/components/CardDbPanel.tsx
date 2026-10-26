import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { useCardDb } from '@/features/cards/store';
import { formatDateTime } from '@/lib/text';
import { colors, radius, spacing } from '@/theme';

/** Status of the local card database with the update button and progress. */
export function CardDbPanel({ compact = false }: { compact?: boolean }) {
  const { cardCount, updatedAt, banlistUpdatedAt, version, hasGerman, syncing, status, lastError, lastMessage, sync } = useCardDb();
  const empty = cardCount === 0;

  return (
    <View style={[styles.panel, empty && styles.panelEmpty]} testID="card-db-panel">
      <View style={styles.header}>
        <Ionicons name={empty ? 'cloud-download' : 'library'} size={compact ? 22 : 28} color={empty ? colors.accent : colors.primary} />
        <View style={{ flex: 1 }}>
          <AppText variant={compact ? 'body' : 'title'} style={{ fontWeight: '700' }}>
            {empty ? 'Kartendatenbank herunterladen' : `${cardCount.toLocaleString('de-DE')} Karten offline verfügbar`}
          </AppText>
          <AppText variant="small">
            {empty
              ? 'Einmalig ca. 30–60 MB über WLAN laden. Danach funktioniert alles offline.'
              : [
                  updatedAt ? `Stand ${formatDateTime(updatedAt)}` : null,
                  banlistUpdatedAt && banlistUpdatedAt !== updatedAt ? `Banlist ${formatDateTime(banlistUpdatedAt)}` : null,
                  version ? `DB-Version ${version}` : null,
                  hasGerman ? 'Deutsch + Englisch' : 'nur Englisch',
                ]
                  .filter(Boolean)
                  .join('  ·  ')}
          </AppText>
        </View>
        {!syncing ? (
          <Button
            testID="card-db-update"
            label={empty ? 'Herunterladen' : 'Aktualisieren'}
            icon={empty ? 'download' : 'refresh'}
            variant={empty ? 'primary' : 'secondary'}
            size={compact ? 'sm' : 'md'}
            onPress={() => sync(false)}
          />
        ) : null}
      </View>
      {syncing ? (
        <View style={styles.progress}>
          <ProgressBar value={status?.progress ?? null} />
          <AppText variant="small">{status?.message ?? 'Starte …'}</AppText>
        </View>
      ) : null}
      {lastError ? (
        <AppText variant="small" style={{ color: colors.danger }}>
          {lastError}
        </AppText>
      ) : null}
      {lastMessage && !syncing ? (
        <AppText variant="small" style={{ color: colors.primary }}>
          {lastMessage}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  panelEmpty: { borderColor: colors.accent },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  progress: { gap: spacing.xs },
});
