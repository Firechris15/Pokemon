import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { EngineDataPanel } from '@/components/engine/EngineDataPanel';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Screen } from '@/components/ui/Screen';
import { useDecks } from '@/features/decks/store';
import { humanGoesFirst, randomSeed, useDuel, type DuelSetup } from '@/features/engine/duelStore';
import { PRESET_DECKS } from '@/features/engine/presetDecks';
import type { AiLevel, DuelConfig, Player } from '@/features/engine/types';
import { listReplays } from '@/features/replays/repository';
import { colors, radius, spacing } from '@/theme';

type DeckOption = { id: string; name: string; main: number[]; extra: number[]; preset: boolean };
type First = 'random' | 'me' | 'ai';

const AI_LEVELS: { level: AiLevel; label: string; text: string }[] = [
  { level: 1, label: 'Stufe 1 – Regeln', text: 'Spielt nach festen Regeln: beschwört, aktiviert, greift an, wenn es sich lohnt.' },
  { level: 2, label: 'Stufe 2 – Suche', text: 'Probiert ihre Züge per Simulation (Monte-Carlo-Suche) aus und wählt den besten. Denkt etwas länger.' },
];

export default function DuelSetupScreen() {
  const decks = useDecks((s) => s.decks);
  const options: DeckOption[] = [
    ...decks.map((d) => ({ id: d.id, name: d.name, main: d.main, extra: d.extra, preset: false })),
    ...PRESET_DECKS.map((d) => ({ id: d.id, name: d.name, main: d.main, extra: d.extra, preset: true })),
  ];
  const [mine, setMine] = useState(options[0]?.id ?? 'preset-yugi');
  const [theirs, setTheirs] = useState('preset-kaiba');
  const [level, setLevel] = useState<AiLevel>(1);
  const [first, setFirst] = useState<First>('random');
  const [replayCount, setReplayCount] = useState(0);

  useEffect(() => {
    listReplays()
      .then((r) => setReplayCount(r.length))
      .catch(() => undefined);
  }, []);

  const myDeck = options.find((o) => o.id === mine) ?? options[0];
  const oppDeck = options.find((o) => o.id === theirs) ?? options[options.length - 1];

  const start = () => {
    if (!myDeck || !oppDeck) return;
    const meFirst = humanGoesFirst(first);
    const human = { name: 'Du', lp: 8000, main: myDeck.main, extra: myDeck.extra, startHand: 5, drawPerTurn: 1, ai: null };
    const ai = { name: 'KI', lp: 8000, main: oppDeck.main, extra: oppDeck.extra, startHand: 5, drawPerTurn: 1, ai: level };
    const config: DuelConfig = { seed: randomSeed(), players: meFirst ? [human, ai] : [ai, human] };
    const setup: DuelSetup = {
      mode: 'ai',
      title: `${myDeck.name} gegen ${oppDeck.name}`,
      myDeck: myDeck.name,
      oppDeck: oppDeck.name,
      aiLevel: level,
      config,
      viewer: (meFirst ? 0 : 1) as Player,
    };
    useDuel.getState().start(setup);
    router.push('/duel/play');
  };

  const deckChips = (selected: string, onSelect: (id: string) => void, prefix: string) => (
    <View style={styles.chips}>
      {options.map((o) => (
        <Chip key={o.id} testID={`${prefix}-${o.id}`} label={`${o.name}${o.preset ? '' : ` (${o.main.length})`}`} selected={o.id === selected} onPress={() => onSelect(o.id)} />
      ))}
    </View>
  );

  return (
    <Screen maxWidth={900}>
      <AppText variant="muted">
        Duelle mit den echten Regeln: Die EDOPro-Regel-Engine prüft jede Aktion. Die KI läuft komplett auf diesem Gerät, auch offline.
      </AppText>

      <EngineDataPanel />

      <View style={styles.card}>
        <AppText variant="label">Dein Deck</AppText>
        {deckChips(mine, setMine, 'my-deck')}
        {myDeck && !myDeck.preset && myDeck.main.length < 40 ? (
          <AppText variant="small" style={{ color: colors.warning }}>
            Das Main Deck hat nur {myDeck.main.length} Karten – zum Üben geht es trotzdem.
          </AppText>
        ) : null}
        <AppText variant="label">Deck der KI</AppText>
        {deckChips(theirs, setTheirs, 'ai-deck')}
        <AppText variant="label">KI-Stärke</AppText>
        <View style={styles.chips}>
          {AI_LEVELS.map((l) => (
            <Chip key={l.level} testID={`ai-level-${l.level}`} label={l.label} selected={level === l.level} onPress={() => setLevel(l.level)} />
          ))}
        </View>
        <AppText variant="small">{AI_LEVELS.find((l) => l.level === level)?.text}</AppText>
        <AppText variant="label">Wer beginnt?</AppText>
        <View style={styles.chips}>
          <Chip testID="first-random" label="Zufall" selected={first === 'random'} onPress={() => setFirst('random')} />
          <Chip testID="first-me" label="Ich" selected={first === 'me'} onPress={() => setFirst('me')} />
          <Chip testID="first-ai" label="KI" selected={first === 'ai'} onPress={() => setFirst('ai')} />
        </View>
      </View>

      <View style={styles.actions}>
        <Button testID="duel-start" label="Duell starten" icon="play" variant="primary" size="lg" onPress={start} disabled={!myDeck || !oppDeck} />
        <Button testID="open-replays" label={`Replays (${replayCount})`} icon="film-outline" onPress={() => router.push('/replays')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
});
