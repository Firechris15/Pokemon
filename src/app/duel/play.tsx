import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { DuelBoard } from '@/components/duel/DuelBoard';
import { afterModal } from '@/components/duel/useDuelActions';
import { answerPrompt, type PromptContext } from '@/components/engine/answerPrompt';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { chooseOption, confirmDialog, showToast } from '@/components/ui/dialogs';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { openCardDetail } from '@/features/cards/detailStore';
import { displayName } from '@/features/cards/labels';
import { useCards } from '@/features/cards/useCards';
import { boardCardIds } from '@/features/duel/state';
import { showPile } from '@/features/duel/sheetStore';
import type { Location, PileZone, Side } from '@/features/duel/types';
import { cardActions, dropActions, LOCATION_NAMES, PHASE_NAMES, phaseActions, type TextSources } from '@/features/engine/actions';
import { useDuel } from '@/features/engine/duelStore';
import { logText } from '@/features/engine/logText';
import { Loc, Msg } from '@/features/engine/ocg';
import type { Player, Prompt } from '@/features/engine/types';
import { boardTarget, parseEngineUid, snapshotToDuelState } from '@/features/engine/view';
import { useSettings } from '@/features/settings/store';
import { colors, radius, spacing, WIDE_BREAKPOINT } from '@/theme';

type EngineLoc = { controller: Player; location: number; sequence: number };

const isBoardPrompt = (prompt: Prompt | null) => prompt !== null && (prompt.request.type === Msg.SELECT_IDLECMD || prompt.request.type === Msg.SELECT_BATTLECMD);

export default function DuelPlayScreen() {
  const status = useDuel((s) => s.status);
  const progress = useDuel((s) => s.progress);
  const error = useDuel((s) => s.error);
  const setup = useDuel((s) => s.setup);

  if (status === 'idle' || !setup) {
    return (
      <View style={styles.center}>
        <AppText variant="muted">Kein Duell aktiv.</AppText>
        <Button label="Neues Duell" variant="primary" onPress={() => router.replace('/duel')} />
      </View>
    );
  }
  if (status === 'preparing') {
    return (
      <View style={styles.center} testID="duel-preparing">
        <ActivityIndicator color={colors.primary} size="large" />
        <AppText>{progress?.label ?? 'Duell wird vorbereitet …'}</AppText>
        {progress ? <ProgressBar value={progress.total ? progress.done / progress.total : null} /> : null}
      </View>
    );
  }
  if (status === 'error') {
    return (
      <View style={styles.center} testID="duel-error">
        <Ionicons name="alert-circle" size={40} color={colors.danger} />
        <AppText style={{ textAlign: 'center' }}>{error}</AppText>
        <Button label="Erneut versuchen" variant="primary" onPress={() => useDuel.getState().start(setup)} />
        <Button label="Zurück" variant="ghost" onPress={() => router.back()} />
      </View>
    );
  }
  return <DuelTable />;
}

function DuelTable() {
  const { width, height } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;
  const language = useSettings((s) => s.language);
  const status = useDuel((s) => s.status);
  const setup = useDuel((s) => s.setup)!;
  const snapshot = useDuel((s) => s.snapshot);
  const log = useDuel((s) => s.log);
  const prompt = useDuel((s) => s.prompt);
  const thinking = useDuel((s) => s.thinking);
  const result = useDuel((s) => s.result);
  const missing = useDuel((s) => s.missingScripts);
  const strings = useDuel((s) => s.strings);
  const systemStrings = useDuel((s) => s.systemStrings);
  const [area, setArea] = useState({ w: 0, h: 0 });
  const [alwaysChain, setAlwaysChain] = useState(false);
  const viewer = setup.viewer;
  const sources: TextSources = { strings, system: systemStrings };

  const state = useMemo(() => (snapshot ? snapshotToDuelState(snapshot) : null), [snapshot]);
  const deckCodes = useMemo(() => setup.config.players.flatMap((p) => [...p.main, ...p.extra]), [setup]);
  const ids = useMemo(() => [...new Set([...deckCodes, ...(state ? boardCardIds(state) : []), ...log.flatMap((e) => ('code' in e ? [e.code] : []))])], [deckCodes, state, log]);
  const cards = useCards(ids);
  const nameOf = (code: number) => {
    const card = cards.get(code);
    return card ? displayName(card, language) : code ? `#${code}` : 'Verdeckte Karte';
  };

  // Hints from drag & drop for the engine's follow-up questions (zone, attack target).
  const pending = useRef<{ place: EngineLoc | null; attack: EngineLoc | null }>({ place: null, attack: null });
  const ctx: PromptContext = {
    viewer,
    sources,
    nameOf,
    alwaysChain,
    takePlace: () => {
      const p = pending.current.place;
      pending.current.place = null;
      return p;
    },
    takeAttackTarget: () => {
      const a = pending.current.attack;
      pending.current.attack = null;
      return a;
    },
  };

  // Engine questions that are not answered on the board open a dialog.
  const handled = useRef<Prompt | null>(null);
  useEffect(() => {
    if (!prompt || handled.current === prompt) return;
    handled.current = prompt;
    if (isBoardPrompt(prompt)) {
      if (prompt.retry) showToast('Das geht gerade nicht.', 'error');
      return;
    }
    answerPrompt(prompt, ctx)
      .then((response) => response && useDuel.getState().respond(response))
      .catch((e) => showToast(String(e), 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt]);

  const respond = useDuel.getState().respond;
  const codeOf = (loc: EngineLoc) => {
    if (!snapshot) return 0;
    const p = snapshot.players[loc.controller];
    const list =
      loc.location === Loc.MZONE ? p.mzone : loc.location === Loc.SZONE ? p.szone : loc.location === Loc.HAND ? p.hand : loc.location === Loc.GRAVE ? p.grave : loc.location === Loc.REMOVED ? p.removed : loc.location === Loc.EXTRA ? p.extra : [];
    const card = loc.location === Loc.MZONE || loc.location === Loc.SZONE ? list[loc.sequence] : list.find((c) => c?.sequence === loc.sequence);
    return card?.code ?? 0;
  };

  const choose = async (loc: EngineLoc, actions: ReturnType<typeof cardActions>) => {
    const code = codeOf(loc);
    const DETAILS = '__details';
    const choice = await chooseOption<string>({
      title: code ? nameOf(code) : 'Verdeckte Karte',
      options: [
        ...actions.map((a) => ({ label: a.label, value: a.key, testID: `engine-action-${a.kind}` })),
        ...(code ? [{ label: 'Kartendetails', value: DETAILS, icon: 'information-circle-outline' as const, testID: 'action-details' }] : []),
      ],
    });
    if (choice === DETAILS) {
      await afterModal();
      openCardDetail(code);
      return;
    }
    const action = actions.find((a) => a.key === choice);
    if (action) respond(action.response);
  };

  const onCardPress = (uid: string) => {
    const loc = parseEngineUid(uid);
    if (!loc) return;
    const actions = isBoardPrompt(prompt) ? cardActions(prompt, loc, sources) : [];
    if (actions.length === 0) {
      const code = codeOf(loc);
      if (code) openCardDetail(code);
      return;
    }
    choose(loc, actions);
  };

  const onDrop = (uid: string, target: Location) => {
    const from = parseEngineUid(uid);
    const to = boardTarget(target, viewer);
    if (!from || !to || !isBoardPrompt(prompt)) return;
    const actions = dropActions(cardActions(prompt, from, sources), from, to);
    if (actions.length === 0) {
      showToast('Das geht gerade nicht.', 'error');
      return;
    }
    pending.current = {
      place: to.controller === viewer && (to.location === Loc.MZONE || to.location === Loc.SZONE) ? to : null,
      attack: to.controller !== viewer && to.location === Loc.MZONE ? to : null,
    };
    if (actions.length === 1) respond(actions[0].response);
    else choose(from, actions);
  };

  const onPilePress = async (side: Side, zone: PileZone) => {
    if (!state) return;
    const list = state[side][zone];
    const title = `${LOCATION_NAMES[{ hand: Loc.HAND, gy: Loc.GRAVE, banished: Loc.REMOVED, deck: Loc.DECK, extra: Loc.EXTRA }[zone]]}${side === 'opp' ? ' des Gegners' : ''}`;
    if (list.length === 0 || zone === 'deck' || list.every((c) => c.cardId === 0)) {
      showToast(`${title}: ${list.length} Karte${list.length === 1 ? '' : 'n'}`);
      return;
    }
    const uid = await showPile({
      title: `${title} (${list.length})`,
      items: [...list].reverse().map((c) => ({ uid: c.uid, cardId: c.cardId, faceDown: c.cardId === 0, caption: '' })),
    });
    if (!uid || uid === 'action') return;
    await afterModal();
    onCardPress(uid);
  };

  const surrender = async () => {
    if (await confirmDialog({ title: 'Aufgeben?', message: 'Das Duell zählt dann als verloren.', confirmLabel: 'Aufgeben', destructive: true })) {
      useDuel.getState().surrender();
    }
  };

  const restart = () => {
    const seed = [String(Date.now()), String(Math.floor(Math.random() * 1e9) + 1), '7', '11'] as [string, string, string, string];
    useDuel.getState().start({ ...setup, config: { ...setup.config, seed } });
  };

  const turnText = snapshot ? `Zug ${snapshot.turn} · ${snapshot.turnPlayer === viewer ? 'Du' : 'Gegner'} · ${PHASE_NAMES[snapshot.phase] ?? ''}` : '';
  const lines = log
    .map((entry, i) => ({ i, text: logText(entry, viewer, nameOf, sources) }))
    .filter((l): l is { i: number; text: string } => l.text !== null)
    .slice(-80)
    .reverse();
  const won = result?.winner === viewer;
  const boardBox = wide ? { flex: 1 } : { height: Math.min(width * 1.3, height * 0.62) };

  return (
    <View style={[styles.root, wide && styles.row]}>
      <Stack.Screen options={{ title: setup.mode === 'puzzle' ? 'Puzzle mit Regeln' : 'Duell gegen die KI' }} />
      <View style={[styles.boardBox, boardBox]} onLayout={(e) => setArea({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {area.w > 0 && state ? (
          <DuelBoard
            state={state}
            cards={cards}
            width={area.w}
            height={area.h}
            onDrop={status === 'playing' ? onDrop : undefined}
            onCardPress={onCardPress}
            onPilePress={onPilePress}
          />
        ) : (
          <ActivityIndicator color={colors.primary} />
        )}
      </View>
      <ScrollView style={wide ? styles.side : styles.below} contentContainerStyle={styles.sideContent}>
        <View style={styles.header}>
          <AppText style={styles.turn} testID="duel-turn">
            {turnText}
          </AppText>
          {thinking ? (
            <View style={styles.thinking} testID="duel-thinking">
              <ActivityIndicator size="small" color={colors.accent} />
              <AppText variant="small">KI denkt nach …</AppText>
            </View>
          ) : null}
        </View>

        {result ? (
          <View style={[styles.result, { borderColor: won ? colors.primary : colors.danger }]} testID="duel-result">
            <AppText variant="title">
              {setup.mode === 'puzzle' ? (won ? 'Puzzle gelöst – nach den echten Regeln!' : 'Puzzle nicht gelöst') : result.winner === null ? 'Unentschieden' : won ? 'Gewonnen!' : 'Verloren'}
            </AppText>
            <AppText variant="muted">{setup.mode === 'puzzle' && !won && result.reason === 'Lebenspunkte auf 0' ? 'Der Zug ist vorbei, ohne dass die LP des Gegners auf 0 gefallen sind.' : result.reason}</AppText>
            <AppText variant="small">Das Replay mit allen Aktionen ist gespeichert.</AppText>
            <View style={styles.buttons}>
              <Button testID="duel-again" label="Nochmal" icon="refresh" variant="primary" onPress={restart} />
              <Button label="Replays" icon="film-outline" onPress={() => router.push('/replays')} />
              <Button
                label="Fertig"
                variant="ghost"
                onPress={() => {
                  useDuel.getState().leave();
                  router.back();
                }}
              />
            </View>
          </View>
        ) : (
          <View style={styles.buttons}>
            {phaseActions(isBoardPrompt(prompt) ? prompt : null).map((a) => (
              <Button key={a.key} testID={`phase-${a.key}`} label={a.label} variant={a.key === 'to-ep' ? 'secondary' : 'primary'} onPress={() => respond(a.response)} />
            ))}
            {!prompt && !thinking && status === 'playing' ? <AppText variant="small">Gegner ist am Zug …</AppText> : null}
            <Button testID="duel-surrender" label="Aufgeben" icon="flag-outline" variant="ghost" onPress={surrender} />
          </View>
        )}

        {snapshot && snapshot.chain.length > 0 ? (
          <View style={styles.chain} testID="duel-chain">
            <AppText variant="label">Kette</AppText>
            {snapshot.chain.map((link, i) => (
              <AppText key={i}>
                {i + 1}. {link.controller === viewer ? 'Du' : 'Gegner'}: {nameOf(link.code)}
              </AppText>
            ))}
          </View>
        ) : null}

        {missing.length > 0 ? (
          <AppText variant="small" style={{ color: colors.warning }}>
            Für {missing.length} Karte(n) fehlen Skripte – ihre Effekte funktionieren in diesem Duell nicht. Mit Internet werden sie beim nächsten Duell geladen.
          </AppText>
        ) : null}

        <View style={styles.buttons}>
          <Chip
            testID="always-chain"
            label={alwaysChain ? 'Ketten: bei jeder Gelegenheit fragen' : 'Ketten: nur bei Auslösern fragen'}
            selected={alwaysChain}
            onPress={() => setAlwaysChain(!alwaysChain)}
          />
        </View>
        <AppText variant="small">
          Tippe Karten für Aktionen an oder ziehe sie auf eine Zone. Langes Drücken zeigt die Karte groß. Schnelle Zauber und Fallen zu beliebigen Zeitpunkten: „bei
          jeder Gelegenheit fragen“ einschalten.
        </AppText>

        <View style={styles.log} testID="duel-log">
          <AppText variant="label">Protokoll</AppText>
          {lines.map((l) => (
            <AppText key={l.i} variant={l.text.startsWith('—') ? 'label' : 'small'} style={!l.text.startsWith('—') && { color: colors.text }}>
              {l.text}
            </AppText>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  row: { flexDirection: 'row' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.xl, backgroundColor: colors.bg },
  boardBox: { alignItems: 'center', justifyContent: 'center', padding: spacing.sm },
  side: { width: 360, maxWidth: 360, borderLeftWidth: 1, borderLeftColor: colors.border, backgroundColor: colors.surface },
  below: { flex: 1, backgroundColor: colors.surface },
  sideContent: { padding: spacing.lg, gap: spacing.md },
  header: { gap: spacing.xs },
  turn: { fontWeight: '700', fontSize: 16 },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  result: { gap: spacing.sm, borderWidth: 2, borderRadius: radius.lg, padding: spacing.lg, backgroundColor: colors.surfaceAlt },
  chain: { gap: 2, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md },
  log: { gap: 3 },
});
