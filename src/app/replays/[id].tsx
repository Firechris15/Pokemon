import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { confirmDialog } from '@/components/ui/dialogs';
import { Screen } from '@/components/ui/Screen';
import { displayName } from '@/features/cards/labels';
import { useCards } from '@/features/cards/useCards';
import { logText } from '@/features/engine/logText';
import { engineStrings, loadSystemStrings } from '@/features/engine/repository';
import { resultLabel } from '@/features/replays/format';
import { deleteReplay, getReplay, type Replay } from '@/features/replays/repository';
import { useSettings } from '@/features/settings/store';
import { formatDateTime } from '@/lib/text';
import { colors, radius, spacing } from '@/theme';

export default function ReplayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const language = useSettings((s) => s.language);
  const [replay, setReplay] = useState<Replay | null | undefined>(undefined);
  const [sources, setSources] = useState<{ strings: Map<number, string[]>; system: Map<number, string> }>({ strings: new Map(), system: new Map() });

  useEffect(() => {
    let active = true;
    getReplay(id)
      .then(async (r) => {
        if (!active) return;
        setReplay(r);
        if (!r) return;
        const codes = r.data.log.flatMap((e) => ('code' in e ? [e.code] : []));
        const [strings, system] = await Promise.all([engineStrings(codes), loadSystemStrings()]);
        if (active) setSources({ strings, system });
      })
      .catch(() => active && setReplay(null));
    return () => {
      active = false;
    };
  }, [id]);

  const codes = useMemo(() => (replay ? [...new Set(replay.data.log.flatMap((e) => ('code' in e ? [e.code] : [])))] : []), [replay]);
  const cards = useCards(codes);
  const nameOf = (code: number) => {
    const card = cards.get(code);
    return card ? displayName(card, language) : `#${code}`;
  };

  if (replay === undefined) return <View style={styles.center} />;
  if (replay === null) {
    return (
      <View style={styles.center}>
        <AppText variant="muted">Replay nicht gefunden.</AppText>
      </View>
    );
  }

  const result = resultLabel(replay);
  const lines = replay.data.log.map((e) => logText(e, replay.viewer, nameOf, sources)).filter((l): l is string => l !== null);

  const remove = async () => {
    if (await confirmDialog({ title: 'Replay löschen?', confirmLabel: 'Löschen', destructive: true })) {
      await deleteReplay(replay.id);
      router.back();
    }
  };

  return (
    <Screen maxWidth={900}>
      <Stack.Screen options={{ title: replay.title }} />
      <View style={styles.card}>
        <AppText variant="title" style={{ color: result.color }}>
          {result.text}
        </AppText>
        <AppText>
          {replay.myDeck} gegen {replay.oppDeck}
        </AppText>
        <AppText variant="small">
          {[formatDateTime(replay.createdAt), `${replay.turns} Züge`, `${replay.data.responses.length} Entscheidungen`, replay.aiLevel ? `KI Stufe ${replay.aiLevel}` : null, replay.reason]
            .filter(Boolean)
            .join(' · ')}
        </AppText>
        <Button label="Replay löschen" icon="trash-outline" variant="ghost" onPress={remove} />
      </View>
      <View style={styles.card} testID="replay-log">
        <AppText variant="label">Aktionsprotokoll</AppText>
        {lines.map((line, i) => (
          <AppText key={i} variant={line.startsWith('—') ? 'label' : 'small'} style={!line.startsWith('—') && { color: colors.text }}>
            {line}
          </AppText>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
});
