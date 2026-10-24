import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CardImage } from '@/components/cards/CardImage';
import { AppText } from '@/components/ui/AppText';
import { Button, IconButton } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { confirmDialog, promptDialog, showToast } from '@/components/ui/dialogs';
import { Screen } from '@/components/ui/Screen';
import { describeDue, isDue } from '@/features/combos/srs';
import { dueCombos, useCombos } from '@/features/combos/store';
import type { Combo } from '@/features/combos/types';
import { useDecks } from '@/features/decks/store';
import { colors, radius, spacing } from '@/theme';

export default function CombosScreen() {
  const combos = useCombos((s) => s.combos);
  const reviews = useCombos((s) => s.reviews);
  const decks = useDecks((s) => s.decks);
  const [deckFilter, setDeckFilter] = useState<string | null>(null);
  const due = useMemo(() => dueCombos(combos, reviews), [combos, reviews]);
  const visible = deckFilter ? combos.filter((c) => c.deckId === deckFilter) : combos;
  const deckIds = new Set(combos.map((c) => c.deckId).filter(Boolean));

  const newCombo = async () => {
    const name = await promptDialog({ title: 'Neue Combo', placeholder: 'z. B. Snake-Eye 1-Karten-Combo', confirmLabel: 'Anlegen' });
    if (!name) return;
    const combo = await useCombos.getState().create(name, deckFilter ?? decks[0]?.id ?? null);
    router.push({ pathname: '/combos/[id]', params: { id: combo.id } });
  };

  return (
    <Screen>
      <View style={styles.toolbar}>
        <Button testID="new-combo" label="Neue Combo" icon="add" variant="primary" onPress={newCombo} />
        <Button
          testID="review-due"
          label={`Fällige wiederholen (${due.length})`}
          icon="repeat"
          disabled={due.length === 0}
          onPress={() => router.push('/combos/review')}
        />
      </View>

      <AppText variant="muted">
        Hinterlege Combo-Routen Schritt für Schritt und lerne sie im Quiz. Combos, die du oft falsch machst, kommen nach dem Wiederholungssystem
        (Spaced Repetition) häufiger dran.
      </AppText>

      {deckIds.size > 0 ? (
        <View style={styles.filters}>
          <Chip label="Alle" selected={deckFilter === null} onPress={() => setDeckFilter(null)} />
          {decks
            .filter((d) => deckIds.has(d.id))
            .map((d) => (
              <Chip key={d.id} label={d.name} selected={deckFilter === d.id} onPress={() => setDeckFilter(d.id)} />
            ))}
        </View>
      ) : null}

      {visible.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="git-network-outline" size={52} color={colors.textFaint} />
          <AppText variant="title">Noch keine Combos</AppText>
          <AppText variant="muted" style={{ textAlign: 'center', maxWidth: 420 }}>
            Lege eine Combo an: Starthand wählen, Schritte eintragen (Karte + Aktion), Endboard festhalten.
          </AppText>
        </View>
      ) : (
        <View style={styles.list}>
          {visible.map((combo) => (
            <ComboRow key={combo.id} combo={combo} due={isDue(reviews[combo.id]) && combo.steps.length > 0} />
          ))}
        </View>
      )}
    </Screen>
  );
}

function ComboRow({ combo, due }: { combo: Combo; due: boolean }) {
  const review = useCombos((s) => s.reviews[combo.id]);
  const stats = useCombos((s) => s.stats[combo.id]);
  const deck = useDecks((s) => s.decks.find((d) => d.id === combo.deckId));
  const hard = Object.values(review?.stepErrors ?? {}).filter((n) => n >= 2).length;
  const cover = combo.steps[0]?.cardId ?? combo.startingHand[0] ?? null;
  const canQuiz = combo.steps.length > 0;

  const remove = async () => {
    const ok = await confirmDialog({ title: 'Combo löschen?', message: `„${combo.name}“ und ihr Lernfortschritt werden gelöscht.`, confirmLabel: 'Löschen', destructive: true });
    if (ok) {
      await useCombos.getState().remove(combo.id);
      showToast('Combo gelöscht');
    }
  };

  return (
    <Pressable
      testID={`combo-${combo.id}`}
      onPress={() => router.push({ pathname: '/combos/[id]', params: { id: combo.id } })}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}>
      <CardImage imageId={cover} size="small" width={52} />
      <View style={{ flex: 1, gap: 3 }}>
        <AppText variant="title" numberOfLines={1}>
          {combo.name}
        </AppText>
        <AppText variant="small">
          {deck ? deck.name : 'Ohne Deck'} · {combo.steps.length} Schritte · Starthand {combo.startingHand.length}
        </AppText>
        <View style={styles.meta}>
          <View style={[styles.badge, due && { backgroundColor: colors.accent }]}>
            <AppText style={[styles.badgeText, due && { color: '#1b1a18' }]}>{canQuiz ? describeDue(review) : 'Noch leer'}</AppText>
          </View>
          {stats && stats.total > 0 ? (
            <AppText variant="small">
              {stats.runs}× geübt · {Math.round((stats.correct / stats.total) * 100)} % richtig
            </AppText>
          ) : null}
          {hard > 0 ? (
            <AppText variant="small" style={{ color: colors.warning }}>
              {hard} {hard === 1 ? 'schwieriger Schritt' : 'schwierige Schritte'}
            </AppText>
          ) : null}
        </View>
      </View>
      <View style={styles.actions}>
        <Button
          testID={`quiz-choice-${combo.id}`}
          label="Quiz"
          icon="list"
          size="sm"
          variant="primary"
          disabled={!canQuiz}
          onPress={() => router.push({ pathname: '/combos/quiz/[id]', params: { id: combo.id, mode: 'choice' } })}
        />
        <Button
          testID={`quiz-free-${combo.id}`}
          label="Frei"
          icon="hand-left-outline"
          size="sm"
          disabled={!canQuiz}
          onPress={() => router.push({ pathname: '/combos/quiz/[id]', params: { id: combo.id, mode: 'free' } })}
        />
        <IconButton
          icon="copy-outline"
          label="Duplizieren"
          size={19}
          onPress={async () => {
            const copy = await useCombos.getState().duplicate(combo.id);
            if (copy) showToast(`„${copy.name}“ erstellt`, 'success');
          }}
        />
        <IconButton icon="trash-outline" label="Löschen" size={19} color={colors.danger} onPress={remove} testID={`delete-combo-${combo.id}`} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  list: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  badge: { backgroundColor: colors.surfaceRaised, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  empty: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxl * 2 },
});
