import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { DuelBoard } from '@/components/duel/DuelBoard';
import { afterModal, useDuelActions } from '@/components/duel/useDuelActions';
import { AppText } from '@/components/ui/AppText';
import { Button, IconButton } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { chooseOption, confirmDialog, promptDialog, showToast } from '@/components/ui/dialogs';
import { TextField } from '@/components/ui/TextField';
import { openCardDetail } from '@/features/cards/detailStore';
import { displayName } from '@/features/cards/labels';
import { pickCards } from '@/features/cards/pickerStore';
import { useCards } from '@/features/cards/useCards';
import { buildMove, isError, type Intent } from '@/features/duel/builder';
import { describeMove, ZONE_NAMES } from '@/features/duel/moves';
import { showPile } from '@/features/duel/sheetStore';
import { applyMoves, cloneDuel, freeSlot, isSlotZone, locate, newInstance, relocate, removeInstance, updateInstance, zoneArray } from '@/features/duel/state';
import type { DuelState, Location, PileZone, Side } from '@/features/duel/types';
import { DIFFICULTIES, DIFFICULTY_LABELS, DIFFICULTY_RATING } from '@/features/puzzles/rating';
import { puzzleCardIds, validatePuzzle } from '@/features/puzzles/solver';
import { usePuzzle, usePuzzles } from '@/features/puzzles/store';
import type { Puzzle, Solution } from '@/features/puzzles/types';
import { useSettings } from '@/features/settings/store';
import { createId } from '@/lib/id';
import { colors, radius, spacing, WIDE_BREAKPOINT } from '@/theme';

export default function PuzzleEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const puzzle = usePuzzle(id);
  if (!puzzle) {
    return (
      <View style={styles.center}>
        <AppText variant="muted">Puzzle nicht gefunden.</AppText>
      </View>
    );
  }
  return <Editor key={puzzle.id} puzzle={puzzle} />;
}

type Mode = 'setup' | 'solutions';

/** Adds new card instances to a zone (slots: the tapped one, then free ones). */
function addCards(input: DuelState, loc: Location, ids: number[]): DuelState {
  const state = cloneDuel(input);
  for (const cardId of ids) {
    const card = newInstance(cardId, loc.side, { revealed: loc.side === 'me' });
    if (isSlotZone(loc.zone)) {
      const arr = zoneArray(state, loc);
      const index = loc.index !== undefined && arr[loc.index] === null ? loc.index : freeSlot(state, loc);
      if (index < 0) break;
      arr[index] = card;
    } else {
      zoneArray(state, loc).push(card);
    }
  }
  return state;
}

function Editor({ puzzle }: { puzzle: Puzzle }) {
  const { width, height } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;
  const language = useSettings((s) => s.language);
  const [mode, setMode] = useState<Mode>('setup');
  const [solutionIndex, setSolutionIndex] = useState(0);
  const [texts, setTexts] = useState({ title: puzzle.title, task: puzzle.task, description: puzzle.description, explanation: puzzle.explanation });
  const [area, setArea] = useState({ w: 0, h: 0 });
  const ids = useMemo(() => puzzleCardIds(puzzle), [puzzle]);
  const cards = useCards(ids);
  const solution: Solution | undefined = puzzle.solutions[solutionIndex];
  const boardState = mode === 'setup' ? puzzle.initial : applyMoves(puzzle.initial, solution?.moves ?? []);
  const problems = validatePuzzle(puzzle);

  const nameOf = (cardId: number) => {
    const card = cards.get(cardId);
    return card ? displayName(card, language) : `#${cardId}`;
  };
  const save = (patch: Partial<Puzzle>) => usePuzzles.getState().save({ ...puzzle, ...patch });
  const setInitial = (initial: DuelState) => save({ initial });
  const saveText = (key: keyof typeof texts) => {
    if (texts[key] !== puzzle[key]) save({ [key]: texts[key] });
  };

  // ---- Setup: place cards freely -------------------------------------------------

  const pick = (title: string, multiple: boolean) => pickCards({ title, multiple, sections: [{ title: 'In diesem Puzzle', ids }] });

  const onZonePress = async (loc: Location) => {
    let target = loc;
    if (loc.zone === 'emz') {
      const side = await chooseOption<Side>({ title: 'Extra-Monsterzone für …', options: [{ label: 'Dich', value: 'me' }, { label: 'Gegner', value: 'opp' }] });
      if (!side) return;
      target = { ...loc, side };
      await afterModal();
    }
    const who = target.side === 'me' ? '' : ' (Gegner)';
    const result = await pick(`${ZONE_NAMES[target.zone]}${who}`, target.zone === 'hand');
    if (result?.length) setInitial(addCards(puzzle.initial, target, result));
  };

  const setupCardMenu = async (uid: string) => {
    const found = locate(puzzle.initial, uid);
    if (!found) return;
    const { loc, card } = found;
    const field = isSlotZone(loc.zone);
    const monsterZone = loc.zone === 'monster' || loc.zone === 'emz';
    const hiddenForPlayer = loc.side === 'opp' && (loc.zone === 'hand' || (field && !card.faceUp));
    const action = await chooseOption({
      title: nameOf(card.cardId),
      options: [
        ...(monsterZone ? [{ label: card.defense ? 'In Angriffsposition' : 'In Verteidigungsposition', value: 'position', testID: 'setup-position' }] : []),
        ...(field ? [{ label: card.faceUp ? 'Verdeckt legen' : 'Offen legen', value: 'face', testID: 'setup-face' }] : []),
        ...(hiddenForPlayer ? [{ label: card.revealed ? 'Für den Spieler verbergen' : 'Dem Spieler zeigen', value: 'reveal', testID: 'setup-reveal' }] : []),
        ...(monsterZone ? [{ label: 'ATK/DEF ändern', value: 'stats', testID: 'setup-stats' }] : []),
        ...(card.atk !== null || card.def !== null ? [{ label: 'Aufgedruckte Werte', value: 'reset' }] : []),
        { label: 'Kartendetails', value: 'details' },
        { label: 'Entfernen', value: 'remove', destructive: true, testID: 'setup-remove' },
      ],
    });
    if (action === 'position') setInitial(updateInstance(puzzle.initial, uid, { defense: !card.defense }));
    if (action === 'face') {
      // Face-down monsters are always in Defense Position.
      const faceUp = !card.faceUp;
      setInitial(updateInstance(puzzle.initial, uid, { faceUp, defense: monsterZone && (!faceUp || card.defense) }));
    }
    if (action === 'reset') setInitial(updateInstance(puzzle.initial, uid, { atk: null, def: null }));
    if (action === 'reveal') setInitial(updateInstance(puzzle.initial, uid, { revealed: !card.revealed }));
    if (action === 'remove') setInitial(removeInstance(puzzle.initial, uid));
    if (action === 'details') {
      await afterModal();
      openCardDetail(card.cardId);
    }
    if (action === 'stats') {
      await afterModal();
      const value = await promptDialog({
        title: 'ATK/DEF ändern',
        message: 'Format „ATK/DEF“, z. B. 3000/2500. Ein leerer Wert bleibt aufgedruckt.',
        defaultValue: `${card.atk ?? cards.get(card.cardId)?.atk ?? ''}/${card.def ?? cards.get(card.cardId)?.def ?? ''}`,
        confirmLabel: 'Übernehmen',
      });
      if (value === null) return;
      const [atk, def] = value.split('/').map((v) => (v.trim() === '' || Number.isNaN(Number(v)) ? null : Math.max(0, Math.round(Number(v)))));
      setInitial(updateInstance(puzzle.initial, uid, { atk: atk ?? null, def: def ?? null }));
    }
  };

  const setupPile = async (side: Side, zone: PileZone) => {
    const list = puzzle.initial[side][zone];
    const title = `${ZONE_NAMES[zone]}${side === 'opp' ? ' des Gegners' : ''} (${list.length})`;
    const result = await showPile({
      title,
      action: 'Karten hinzufügen',
      items: [...list].reverse().map((c) => ({ uid: c.uid, cardId: c.cardId, faceDown: false, caption: '' })),
    });
    await afterModal();
    if (result === 'action') {
      const picked = await pick(title, true);
      if (picked?.length) setInitial(addCards(puzzle.initial, { side, zone }, picked));
    } else if (result) {
      setupCardMenu(result);
    }
  };

  // ---- Solutions: record moves ----------------------------------------------------

  const saveSolutions = (solutions: Solution[]) => save({ solutions });
  const record = (intent: Intent) => {
    if (!solution) return;
    const move = buildMove(boardState, intent, (cardId) => cards.get(cardId));
    if (isError(move)) {
      showToast(move.error, 'error');
      return;
    }
    // Opponent actions are played automatically by default.
    const recorded = { ...move, auto: move.actor === 'opp' };
    saveSolutions(puzzle.solutions.map((s, i) => (i === solutionIndex ? { ...s, moves: [...s.moves, recorded] } : s)));
  };
  const actions = useDuelActions({ state: boardState, cards, actor: null, onIntent: record });

  const addSolution = async () => {
    const name = await promptDialog({ title: 'Neue Lösung', defaultValue: `Lösung ${puzzle.solutions.length + 1}`, confirmLabel: 'Anlegen' });
    if (!name) return;
    saveSolutions([...puzzle.solutions, { id: createId(), name, moves: [] }]);
    setSolutionIndex(puzzle.solutions.length);
  };
  const copySolution = () => {
    if (!solution) return;
    saveSolutions([...puzzle.solutions, { id: createId(), name: `${solution.name} (Variante)`, moves: solution.moves.map((m) => ({ ...m, id: createId() })) }]);
    setSolutionIndex(puzzle.solutions.length);
  };
  const renameSolution = async () => {
    if (!solution) return;
    const name = await promptDialog({ title: 'Lösung umbenennen', defaultValue: solution.name });
    if (name) saveSolutions(puzzle.solutions.map((s, i) => (i === solutionIndex ? { ...s, name } : s)));
  };
  const deleteSolution = async () => {
    if (!solution || !(await confirmDialog({ title: `„${solution.name}“ löschen?`, confirmLabel: 'Löschen', destructive: true }))) return;
    saveSolutions(puzzle.solutions.filter((_, i) => i !== solutionIndex));
    setSolutionIndex(Math.max(0, solutionIndex - 1));
  };
  const updateMove = (index: number, patch: { auto?: boolean; unordered?: boolean; note?: string }) => {
    if (!solution) return;
    const moves = solution.moves.map((m, i) => (i === index ? { ...m, ...patch } : m));
    saveSolutions(puzzle.solutions.map((s, i) => (i === solutionIndex ? { ...s, moves } : s)));
  };
  const editNote = async (index: number) => {
    const move = solution?.moves[index];
    if (!move) return;
    const note = await promptDialog({ title: 'Erklärung zum Zug', message: 'Wird beim Lösen nach automatischen Zügen angezeigt.', defaultValue: move.note });
    if (note !== null) updateMove(index, { note });
  };
  const undoMove = () => {
    if (!solution || solution.moves.length === 0) return;
    saveSolutions(puzzle.solutions.map((s, i) => (i === solutionIndex ? { ...s, moves: s.moves.slice(0, -1) } : s)));
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    if (next === 'solutions' && puzzle.solutions.length === 0) saveSolutions([{ id: createId(), name: 'Lösung 1', moves: [] }]);
  };

  const setLp = (side: Side, text: string) => {
    const lp = Math.max(0, Math.round(Number(text)));
    if (Number.isNaN(lp) || lp === puzzle.initial[side].lp) return;
    const initial = cloneDuel(puzzle.initial);
    initial[side].lp = lp;
    setInitial(initial);
  };

  const boardBox = wide ? { flex: 1 } : { height: Math.min(width * 1.3, height * 0.6) };
  const setupMode = mode === 'setup';

  const details = (
    <View style={styles.section}>
      <TextField testID="puzzle-title" value={texts.title} placeholder="Titel" onChangeText={(title) => setTexts({ ...texts, title })} onEndEditing={() => saveText('title')} onBlur={() => saveText('title')} />
      <TextField testID="puzzle-task" value={texts.task} placeholder="Aufgabe, z. B. OTK oder „Ash Blossom umgehen“" onChangeText={(task) => setTexts({ ...texts, task })} onBlur={() => saveText('task')} />
      <TextField
        testID="puzzle-description"
        value={texts.description}
        placeholder="Ausgangslage (bekannte Karten, Verhalten des Gegners …)"
        multiline
        onChangeText={(description) => setTexts({ ...texts, description })}
        onBlur={() => saveText('description')}
      />
      <TextField
        testID="puzzle-explanation"
        value={texts.explanation}
        placeholder="Erklärung der Lösung (wird danach gezeigt)"
        multiline
        onChangeText={(explanation) => setTexts({ ...texts, explanation })}
        onBlur={() => saveText('explanation')}
      />
      <AppText variant="label">Ziel</AppText>
      <View style={styles.chips}>
        <Chip testID="goal-lethal" label="Gegner auf 0 LP" selected={puzzle.goal === 'lethal'} onPress={() => save({ goal: 'lethal' })} />
        <Chip testID="goal-sequence" label="Komplette Zugfolge" selected={puzzle.goal === 'sequence'} onPress={() => save({ goal: 'sequence' })} />
      </View>
      <AppText variant="label">Schwierigkeit</AppText>
      <View style={styles.chips}>
        {DIFFICULTIES.map((d) => (
          <Chip key={d} testID={`difficulty-${d}`} label={DIFFICULTY_LABELS[d]} selected={puzzle.difficulty === d} onPress={() => save({ difficulty: d, rating: DIFFICULTY_RATING[d] })} />
        ))}
      </View>
      <AppText variant="label">Lebenspunkte</AppText>
      <View style={styles.lpRow}>
        {(['me', 'opp'] as Side[]).map((side) => (
          <View key={side} style={{ flex: 1, gap: 4 }}>
            <AppText variant="small">{side === 'me' ? 'Du' : 'Gegner'}</AppText>
            <TextField
              testID={`lp-input-${side}`}
              keyboardType="number-pad"
              defaultValue={String(puzzle.initial[side].lp)}
              onChangeText={(text) => setLp(side, text)}
            />
          </View>
        ))}
      </View>
      <AppText variant="small">
        Aufbau: Tippe auf eine leere Zone oder Hand, um Karten hinzuzufügen. Ziehe Karten, um sie zu verschieben, und tippe sie an für Position, Werte und Entfernen.
      </AppText>
    </View>
  );

  const solutionsPanel = (
    <View style={styles.section}>
      {problems.length > 0 ? (
        <View style={styles.problems} testID="puzzle-problems">
          {problems.map((p) => (
            <AppText key={p} style={{ color: colors.warning }}>
              • {p}
            </AppText>
          ))}
        </View>
      ) : (
        <AppText style={{ color: colors.primary }}>Das Puzzle ist lösbar.</AppText>
      )}
      <View style={styles.chips}>
        {puzzle.solutions.map((s, i) => (
          <Chip key={s.id} testID={`solution-${i}`} label={`${s.name} (${s.moves.length})`} selected={i === solutionIndex} onPress={() => setSolutionIndex(i)} />
        ))}
        <Chip testID="solution-add" label="+ Lösung" onPress={addSolution} />
      </View>
      {solution ? (
        <>
          <View style={styles.chips}>
            <Button size="sm" label="Umbenennen" icon="create-outline" onPress={renameSolution} />
            <Button size="sm" label="Als Variante kopieren" icon="copy-outline" onPress={copySolution} />
            <Button size="sm" label="Löschen" icon="trash-outline" variant="ghost" onPress={deleteSolution} />
          </View>
          <AppText variant="small">
            Spiele die Lösung auf dem Feld vor. Züge des Gegners laufen beim Lösen automatisch ab – markiere auch eigene Folgezüge (z. B. Effektauflösung) als „Auto“. Mit „Frei“ markierte
            Züge dürfen in beliebiger Reihenfolge kommen.
          </AppText>
          <View style={styles.moves}>
            {solution.moves.length === 0 ? <AppText variant="muted">Noch keine Züge aufgenommen.</AppText> : null}
            {solution.moves.map((move, i) => (
              <View key={move.id} style={styles.move} testID={`recorded-move-${i}`}>
                <AppText style={{ flex: 1 }} variant={move.auto ? 'small' : 'body'}>
                  {i + 1}. {describeMove(move, nameOf)}
                  {move.note ? `\n„${move.note}“` : ''}
                </AppText>
                <Chip label="Auto" selected={move.auto} onPress={() => updateMove(i, { auto: !move.auto })} testID={`move-auto-${i}`} />
                {!move.auto ? <Chip label="Frei" selected={Boolean(move.unordered)} onPress={() => updateMove(i, { unordered: !move.unordered })} testID={`move-free-${i}`} /> : null}
                <IconButton icon="chatbox-ellipses-outline" label="Notiz" size={20} onPress={() => editNote(i)} />
              </View>
            ))}
          </View>
          <Button testID="move-undo" label="Letzten Zug löschen" icon="arrow-undo" disabled={solution.moves.length === 0} onPress={undoMove} />
        </>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.root, wide && styles.row]}>
      <Stack.Screen
        options={{
          title: puzzle.title || 'Puzzle',
          headerRight: () => (
            <IconButton icon="play" label="Puzzle testen" testID="editor-test" onPress={() => router.push({ pathname: '/puzzles/[id]', params: { id: puzzle.id } })} />
          ),
        }}
      />
      <View style={[styles.boardBox, boardBox]} onLayout={(e) => setArea({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {area.w > 0 ? (
          <DuelBoard
            state={boardState}
            cards={cards}
            width={area.w}
            height={area.h}
            revealAll
            onDrop={setupMode ? (uid, target) => setInitial(relocate(puzzle.initial, uid, target)) : actions.onDrop}
            onCardPress={setupMode ? setupCardMenu : actions.onCardPress}
            onPilePress={setupMode ? setupPile : actions.onPilePress}
            onZonePress={setupMode ? onZonePress : undefined}
          />
        ) : null}
      </View>
      <ScrollView style={wide ? styles.side : styles.below} contentContainerStyle={styles.sideContent} keyboardShouldPersistTaps="handled">
        <View style={styles.tabs}>
          <Chip testID="mode-setup" label="Aufbau" selected={setupMode} onPress={() => switchMode('setup')} />
          <Chip testID="mode-solutions" label={`Lösungen (${puzzle.solutions.length})`} selected={!setupMode} onPress={() => switchMode('solutions')} />
        </View>
        {setupMode ? details : solutionsPanel}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  row: { flexDirection: 'row' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  boardBox: { alignItems: 'center', justifyContent: 'center', padding: spacing.sm },
  side: { width: 380, maxWidth: 380, borderLeftWidth: 1, borderLeftColor: colors.border, backgroundColor: colors.surface },
  below: { flex: 1, backgroundColor: colors.surface },
  sideContent: { padding: spacing.lg, gap: spacing.md },
  tabs: { flexDirection: 'row', gap: spacing.sm },
  section: { gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  lpRow: { flexDirection: 'row', gap: spacing.md },
  problems: { gap: 4, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md },
  moves: { gap: spacing.sm },
  move: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.sm },
});
