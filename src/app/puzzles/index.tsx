import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button, IconButton } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { chooseOption, confirmDialog, promptDialog, showToast } from '@/components/ui/dialogs';
import { Screen } from '@/components/ui/Screen';
import { afterModal } from '@/components/duel/useDuelActions';
import { decodePuzzle, encodePuzzle } from '@/features/puzzles/codec';
import { DIFFICULTIES, DIFFICULTY_LABELS } from '@/features/puzzles/rating';
import { currentStreak, todaysDaily, usePuzzles } from '@/features/puzzles/store';
import type { Difficulty, Puzzle } from '@/features/puzzles/types';
import { colors, radius, spacing } from '@/theme';

const SOURCE_LABELS: Record<Puzzle['source'], string> = { sample: 'Beispiel', user: 'Eigenes', import: 'Importiert' };

export default function PuzzlesScreen() {
  const puzzles = usePuzzles((s) => s.puzzles);
  const stats = usePuzzles((s) => s.stats);
  const rating = usePuzzles((s) => s.rating);
  const daily = usePuzzles((s) => s.daily);
  const [filter, setFilter] = useState<Difficulty | null>(null);
  const today = todaysDaily(daily);
  const dailyPuzzle = puzzles.find((p) => p.id === today?.puzzleId);
  const streak = currentStreak(daily);
  const solvedCount = puzzles.filter((p) => stats[p.id]?.solved).length;
  // The app may stay open past midnight: pick the new daily puzzle on entry.
  useEffect(() => {
    usePuzzles.getState().ensureDaily();
  }, []);

  const visible = puzzles
    .filter((p) => filter === null || p.difficulty === filter)
    .sort((a, b) => a.difficulty - b.difficulty || a.createdAt - b.createdAt || a.title.localeCompare(b.title));

  const open = (puzzle: Puzzle) => router.push({ pathname: '/puzzles/[id]', params: { id: puzzle.id } });
  const edit = (puzzle: Puzzle) => router.push({ pathname: '/puzzles/edit/[id]', params: { id: puzzle.id } });

  const create = async () => {
    const title = await promptDialog({ title: 'Neues Puzzle', placeholder: 'z. B. Durch Nibiru spielen', confirmLabel: 'Anlegen' });
    if (!title) return;
    edit(await usePuzzles.getState().create(title));
  };

  const importCode = async () => {
    const text = await promptDialog({ title: 'Puzzle-Code einfügen', message: 'Füge einen geteilten Code ein (beginnt mit „ygo-puzzle:“).', placeholder: 'ygo-puzzle:…', confirmLabel: 'Importieren' });
    if (!text) return;
    const result = decodePuzzle(text);
    if ('error' in result) {
      showToast(result.error, 'error');
      return;
    }
    await usePuzzles.getState().add(result);
    showToast(`„${result.title}“ importiert`, 'success');
  };

  const more = async (puzzle: Puzzle) => {
    const own = puzzle.source === 'user';
    const action = await chooseOption({
      title: puzzle.title,
      options: [
        { label: own ? 'Bearbeiten' : 'Kopie bearbeiten', value: 'edit', icon: 'create-outline' as const, testID: 'puzzle-action-edit' },
        { label: 'Puzzle-Code kopieren', value: 'share', icon: 'share-outline' as const, testID: 'puzzle-action-share' },
        { label: 'Löschen', value: 'delete', icon: 'trash-outline' as const, destructive: true, testID: 'puzzle-action-delete' },
      ],
    });
    if (action === 'edit') {
      if (own) edit(puzzle);
      else {
        const copy = await usePuzzles.getState().duplicate(puzzle.id);
        if (copy) edit(copy);
      }
    } else if (action === 'share') {
      await Clipboard.setStringAsync(encodePuzzle(puzzle));
      showToast('Puzzle-Code kopiert', 'success');
    } else if (action === 'delete') {
      await afterModal();
      if (await confirmDialog({ title: `„${puzzle.title}“ löschen?`, confirmLabel: 'Löschen', destructive: true })) {
        await usePuzzles.getState().remove(puzzle.id);
      }
    }
  };

  return (
    <Screen maxWidth={1000}>
      <View style={styles.cards}>
        <View style={[styles.stat, styles.ratingCard]} testID="puzzle-rating">
          <AppText variant="label">Puzzle-Rating</AppText>
          <AppText variant="hero">{rating.rating}</AppText>
          <AppText variant="small">
            {rating.games} gewertet · Bestwert {rating.best}
          </AppText>
        </View>
        <View style={styles.stat} testID="puzzle-streak">
          <AppText variant="label">Serie</AppText>
          <View style={styles.inline}>
            <Ionicons name="flame" size={28} color={streak > 0 ? colors.warning : colors.textFaint} />
            <AppText variant="hero">{streak}</AppText>
          </View>
          <AppText variant="small">
            {solvedCount}/{puzzles.length} gelöst
          </AppText>
        </View>
        {dailyPuzzle ? (
          <Pressable testID="daily-puzzle" onPress={() => open(dailyPuzzle)} style={({ pressed }) => [styles.stat, styles.daily, pressed && { opacity: 0.8 }]}>
            <View style={styles.inline}>
              <Ionicons name="calendar" size={18} color={colors.accent} />
              <AppText variant="label" style={{ color: colors.accent }}>
                Tagespuzzle
              </AppText>
            </View>
            <AppText variant="title" numberOfLines={1}>
              {dailyPuzzle.title}
            </AppText>
            <AppText variant="small">
              {DIFFICULTY_LABELS[dailyPuzzle.difficulty]} · {today?.solvedAt ? 'Heute gelöst ✓' : 'Jetzt lösen'}
            </AppText>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.toolbar}>
        <Button testID="puzzle-new" label="Neues Puzzle" icon="add" variant="primary" onPress={create} />
        <Button testID="puzzle-import" label="Code einfügen" icon="clipboard-outline" onPress={importCode} />
      </View>

      <View style={styles.filters}>
        <Chip label="Alle" selected={filter === null} onPress={() => setFilter(null)} />
        {DIFFICULTIES.map((d) => (
          <Chip key={d} testID={`filter-difficulty-${d}`} label={DIFFICULTY_LABELS[d]} selected={filter === d} onPress={() => setFilter(filter === d ? null : d)} />
        ))}
      </View>

      <View style={styles.list}>
        {visible.length === 0 ? <AppText variant="muted">Keine Puzzles in dieser Stufe.</AppText> : null}
        {visible.map((puzzle) => {
          const s = stats[puzzle.id];
          return (
            <Pressable key={puzzle.id} testID={`puzzle-${puzzle.id}`} onPress={() => open(puzzle)} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}>
              <Ionicons name={s?.solved ? 'checkmark-circle' : 'extension-puzzle-outline'} size={26} color={s?.solved ? colors.primary : colors.textMuted} />
              <View style={{ flex: 1 }}>
                <AppText style={{ fontWeight: '700' }} numberOfLines={1}>
                  {puzzle.title}
                </AppText>
                <AppText variant="small" numberOfLines={1}>
                  {[puzzle.task, DIFFICULTY_LABELS[puzzle.difficulty], `Rating ${Math.round(puzzle.rating)}`, SOURCE_LABELS[puzzle.source], s ? `${s.attempts}× versucht` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </AppText>
              </View>
              {puzzle.solutions.length === 0 ? <AppText variant="small" style={{ color: colors.warning }}>ohne Lösung</AppText> : null}
              <IconButton icon="ellipsis-horizontal" label="Mehr" onPress={() => more(puzzle)} testID={`puzzle-more-${puzzle.id}`} />
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  stat: { flexGrow: 1, flexBasis: 200, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.xs },
  ratingCard: { borderLeftWidth: 4, borderLeftColor: colors.primary },
  daily: { borderWidth: 1, borderColor: colors.accent, flexBasis: 260 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  list: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
});
