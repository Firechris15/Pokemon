import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { DuelBoard } from '@/components/duel/DuelBoard';
import { afterModal } from '@/components/duel/useDuelActions';
import { AnalysisView } from '@/components/replays/AnalysisView';
import { MatchStatsView } from '@/components/replays/MatchStatsView';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { confirmDialog, showToast } from '@/components/ui/dialogs';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { openCardDetail } from '@/features/cards/detailStore';
import { displayName } from '@/features/cards/labels';
import { useCards } from '@/features/cards/useCards';
import { boardCardIds } from '@/features/duel/state';
import { showPile } from '@/features/duel/sheetStore';
import type { PileZone, Side } from '@/features/duel/types';
import { LOCATION_NAMES, PHASE_NAMES } from '@/features/engine/actions';
import { logText } from '@/features/engine/logText';
import { Loc } from '@/features/engine/ocg';
import { maskHidden, parseEngineUid, snapshotToDuelState } from '@/features/engine/view';
import { resultLabel } from '@/features/replays/format';
import { deleteReplay, getReplay, type Replay } from '@/features/replays/repository';
import { matchStats } from '@/features/replays/stats';
import { useReplayViewer } from '@/features/replays/viewerStore';
import { useSettings } from '@/features/settings/store';
import { formatDateTime } from '@/lib/text';
import { colors, radius, spacing, WIDE_BREAKPOINT } from '@/theme';

type Tab = 'log' | 'stats' | 'ai';

export default function ReplayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [replay, setReplay] = useState<Replay | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    getReplay(id)
      .then((r) => {
        if (!active) return;
        setReplay(r);
        if (r) useReplayViewer.getState().open(r);
      })
      .catch(() => active && setReplay(null));
    return () => {
      active = false;
      useReplayViewer.getState().close();
    };
  }, [id]);

  if (replay === undefined) return <View style={styles.center} />;
  if (replay === null) {
    return (
      <View style={styles.center}>
        <AppText variant="muted">Replay nicht gefunden.</AppText>
      </View>
    );
  }
  return <ReplayViewer replay={replay} />;
}

function ReplayViewer({ replay }: { replay: Replay }) {
  const { width, height } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;
  const language = useSettings((s) => s.language);
  const status = useReplayViewer((s) => s.status);
  const progress = useReplayViewer((s) => s.progress);
  const error = useReplayViewer((s) => s.error);
  const info = useReplayViewer((s) => s.info);
  const frameIndex = useReplayViewer((s) => s.frame);
  const snapshot = useReplayViewer((s) => s.snapshot);
  const playing = useReplayViewer((s) => s.playing);
  const strings = useReplayViewer((s) => s.strings);
  const systemStrings = useReplayViewer((s) => s.systemStrings);
  const [reveal, setReveal] = useState(false);
  const [tab, setTab] = useState<Tab>('log');
  const [area, setArea] = useState({ w: 0, h: 0 });
  const viewer = replay.viewer;
  const log = replay.data.log;
  const sources = useMemo(() => ({ strings, system: systemStrings }), [strings, systemStrings]);

  const shown = useMemo(() => (snapshot ? (reveal ? snapshot : maskHidden(snapshot)) : null), [snapshot, reveal]);
  const state = useMemo(() => (shown ? snapshotToDuelState(shown) : null), [shown]);
  const deckCodes = useMemo(() => replay.data.config.players.flatMap((p) => [...p.main, ...p.extra]), [replay]);
  const ids = useMemo(
    () => [...new Set([...deckCodes, ...(state ? boardCardIds(state) : []), ...log.flatMap((e) => ('code' in e ? [e.code] : []))])],
    [deckCodes, state, log]
  );
  const cards = useCards(ids);
  const nameOf = (code: number) => {
    const card = cards.get(code);
    return card ? displayName(card, language) : code ? `#${code}` : 'Verdeckte Karte';
  };

  // Puzzles set their own LP; the engine's first frame knows them.
  const stats = useMemo(() => matchStats(replay.data, viewer, replay.mode === 'puzzle' && info ? info.frames[0].lp : undefined), [replay, viewer, info]);

  const frames = useMemo(() => info?.frames ?? [], [info]);
  const frame = frames[frameIndex];
  const isLast = frames.length > 0 && frameIndex === frames.length - 1;
  const logEnd = frame ? (isLast ? log.length : frame.logEnd) : 0;
  const prevEnd = frameIndex > 0 ? frames[frameIndex - 1].logEnd : 0;
  const turns = useMemo(() => [...new Set(frames.map((f) => f.turn).filter((t) => t > 0))], [frames]);
  const viewerState = useReplayViewer.getState();
  const gotoTurn = (turn: number) => {
    const index = frames.findIndex((f) => f.turn === turn);
    if (index >= 0) viewerState.goto(index);
  };
  const gotoLog = (i: number) => {
    const index = frames.findIndex((f) => f.logEnd > i);
    viewerState.goto(index < 0 ? frames.length - 1 : index);
  };

  const lines = log
    .slice(0, logEnd)
    .map((entry, i) => ({ i, text: logText(entry, viewer, nameOf, sources) }))
    .filter((l): l is { i: number; text: string } => l.text !== null)
    .reverse();

  const codeAt = (uid: string) => {
    const loc = parseEngineUid(uid);
    if (!loc || !shown) return 0;
    const p = shown.players[loc.controller];
    if (loc.location === Loc.MZONE) return p.mzone[loc.sequence]?.code ?? 0;
    if (loc.location === Loc.SZONE) return p.szone[loc.sequence]?.code ?? 0;
    const list = loc.location === Loc.HAND ? p.hand : loc.location === Loc.GRAVE ? p.grave : loc.location === Loc.REMOVED ? p.removed : loc.location === Loc.EXTRA ? p.extra : [];
    return list.find((c) => c.sequence === loc.sequence)?.code ?? 0;
  };
  const onCardPress = (uid: string) => {
    const code = codeAt(uid);
    if (code) openCardDetail(code);
  };
  const onPilePress = async (side: Side, zone: PileZone) => {
    if (!state) return;
    const list = state[side][zone];
    const title = `${LOCATION_NAMES[{ hand: Loc.HAND, gy: Loc.GRAVE, banished: Loc.REMOVED, deck: Loc.DECK, extra: Loc.EXTRA }[zone]]}${side === 'opp' ? ' des Gegners' : ''}`;
    if (list.length === 0 || zone === 'deck' || list.every((c) => c.cardId === 0)) {
      showToast(`${title}: ${list.length} Karte${list.length === 1 ? '' : 'n'}`);
      return;
    }
    const uid = await showPile({ title: `${title} (${list.length})`, items: [...list].reverse().map((c) => ({ uid: c.uid, cardId: c.cardId, faceDown: c.cardId === 0, caption: '' })) });
    if (!uid || uid === 'action') return;
    await afterModal();
    onCardPress(uid);
  };

  const remove = async () => {
    if (await confirmDialog({ title: 'Replay löschen?', confirmLabel: 'Löschen', destructive: true })) {
      await deleteReplay(replay.id);
      router.back();
    }
  };

  const result = resultLabel(replay);
  const turnText = frame ? `Zug ${frame.turn} · ${frame.turnPlayer === viewer ? 'Du' : 'Gegner'} · ${PHASE_NAMES[frame.phase] ?? ''}` : '';
  const boardBox = wide ? { flex: 1 } : { height: Math.min(width * 1.3, height * 0.55) };

  return (
    <View style={[styles.root, wide && styles.row]}>
      <Stack.Screen options={{ title: replay.title }} />
      <View style={wide ? styles.left : undefined}>
        <View style={[styles.boardBox, boardBox]} onLayout={(e) => setArea({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
          {status === 'error' ? (
            <View style={styles.message} testID="replay-error">
              <Ionicons name="alert-circle" size={36} color={colors.danger} />
              <AppText style={{ textAlign: 'center' }}>{error}</AppText>
              <Button label="Erneut versuchen" onPress={() => useReplayViewer.getState().open(replay)} />
            </View>
          ) : area.w > 0 && state && status === 'ready' ? (
            <DuelBoard state={state} cards={cards} width={area.w} height={area.h} onCardPress={onCardPress} onPilePress={onPilePress} revealAll={reveal} />
          ) : (
            <View style={styles.message} testID="replay-loading">
              <ActivityIndicator color={colors.primary} />
              <AppText variant="muted">{progress?.label ?? 'Replay wird geladen …'}</AppText>
              {progress?.total ? <ProgressBar value={progress.done / progress.total} /> : null}
            </View>
          )}
        </View>
        <View style={styles.controls}>
          <View style={styles.transport}>
            <ControlButton icon="play-skip-back" label="Zum Anfang" onPress={() => viewerState.goto(0)} disabled={!info} />
            <ControlButton testID="replay-prev" icon="chevron-back" label="Schritt zurück" onPress={() => viewerState.step(-1)} disabled={!info} />
            <ControlButton testID="replay-play" icon={playing ? 'pause' : 'play'} label={playing ? 'Pause' : 'Abspielen'} onPress={() => viewerState.setPlaying(!playing)} disabled={!info} big />
            <ControlButton testID="replay-next" icon="chevron-forward" label="Schritt vor" onPress={() => viewerState.step(1)} disabled={!info} />
            <ControlButton testID="replay-end" icon="play-skip-forward" label="Zum Ende" onPress={() => viewerState.goto(frames.length - 1)} disabled={!info} />
            <View style={{ flex: 1, minWidth: 120 }}>
              <AppText style={styles.turnText} testID="replay-turn" numberOfLines={1}>
                {turnText}
              </AppText>
              <AppText variant="small">{info ? `Schritt ${frameIndex + 1} von ${frames.length}` : ''}</AppText>
            </View>
          </View>
          {turns.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.turns}>
              {turns.map((t) => (
                <Chip key={t} testID={`replay-turn-${t}`} label={`Zug ${t}`} selected={frame?.turn === t} onPress={() => gotoTurn(t)} />
              ))}
            </ScrollView>
          ) : null}
          <View style={styles.turns}>
            <Chip testID="replay-reveal" label={reveal ? 'Karten des Gegners: sichtbar' : 'Karten des Gegners: verdeckt'} selected={reveal} onPress={() => setReveal(!reveal)} />
          </View>
          {info?.diverged !== null && info?.diverged !== undefined ? (
            <AppText variant="small" style={{ color: colors.warning }}>
              Das Replay endet früher: Seit dem Duell wurden Kartenskripte aktualisiert, ab dort passt der Ablauf nicht mehr zur Regel-Engine.
            </AppText>
          ) : null}
        </View>
      </View>

      <View style={wide ? styles.side : styles.below}>
        <View style={styles.summary}>
          <AppText variant="title" style={{ color: result.color }}>
            {result.text}
          </AppText>
          <AppText variant="small">
            {[`${replay.myDeck} gegen ${replay.oppDeck}`, formatDateTime(replay.createdAt), `${replay.turns} Züge`, replay.aiLevel ? `KI Stufe ${replay.aiLevel}` : null, replay.reason]
              .filter(Boolean)
              .join(' · ')}
          </AppText>
        </View>
        <View style={styles.tabs}>
          <Chip testID="tab-log" label="Protokoll" selected={tab === 'log'} onPress={() => setTab('log')} />
          <Chip testID="tab-stats" label="Analyse" selected={tab === 'stats'} onPress={() => setTab('stats')} />
          <Chip testID="tab-ai" label="KI-Kommentar" selected={tab === 'ai'} onPress={() => setTab('ai')} />
        </View>
        <ScrollView contentContainerStyle={styles.sideContent}>
          {tab === 'log' ? (
            <View style={styles.log} testID="replay-log">
              {lines.length === 0 ? <AppText variant="small">Noch keine Aktionen.</AppText> : null}
              {lines.map((l) => (
                <Pressable key={l.i} onPress={() => gotoLog(l.i)}>
                  <AppText
                    variant={l.text.startsWith('—') ? 'label' : 'small'}
                    style={[!l.text.startsWith('—') && { color: colors.text }, l.i >= prevEnd && frameIndex > 0 && styles.fresh]}>
                    {l.text}
                  </AppText>
                </Pressable>
              ))}
            </View>
          ) : null}
          {tab === 'stats' ? <MatchStatsView stats={stats} nameOf={nameOf} onTurnPress={gotoTurn} /> : null}
          {tab === 'ai' ? (
            <AnalysisView
              replay={replay}
              info={info}
              names={{ nameOf, sources }}
              verify={(s) => useReplayViewer.getState().verify(s)}
              onShowFrame={(f) => viewerState.goto(f)}
              onShowTurn={gotoTurn}
            />
          ) : null}
          <Button label="Replay löschen" icon="trash-outline" variant="ghost" onPress={remove} />
        </ScrollView>
      </View>
    </View>
  );
}

function ControlButton(props: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; disabled?: boolean; big?: boolean; testID?: string }) {
  return (
    <Pressable
      testID={props.testID}
      accessibilityLabel={props.label}
      disabled={props.disabled}
      onPress={props.onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.control, props.big && styles.controlBig, pressed && { backgroundColor: colors.surfaceRaised }, props.disabled && { opacity: 0.4 }]}>
      <Ionicons name={props.icon} size={props.big ? 26 : 20} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  row: { flexDirection: 'row' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  left: { flex: 1 },
  boardBox: { alignItems: 'center', justifyContent: 'center', padding: spacing.sm },
  message: { alignItems: 'center', gap: spacing.md, padding: spacing.xl },
  controls: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, gap: spacing.sm },
  transport: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  control: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  controlBig: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary },
  turnText: { fontWeight: '700' },
  turns: { flexDirection: 'row', gap: spacing.sm },
  side: { width: 380, maxWidth: 380, borderLeftWidth: 1, borderLeftColor: colors.border, backgroundColor: colors.surface },
  below: { flex: 1, backgroundColor: colors.surface },
  summary: { padding: spacing.lg, paddingBottom: spacing.sm, gap: 2 },
  tabs: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  sideContent: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  log: { gap: 3 },
  fresh: { backgroundColor: 'rgba(129,182,76,0.18)', borderRadius: radius.sm },
});
