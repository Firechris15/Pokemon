import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CardTile } from '@/components/cards/CardTile';
import { StepEditor } from '@/components/combos/StepEditor';
import { StepRow } from '@/components/combos/StepRow';
import { ZoneBoard } from '@/components/combos/ZoneBoard';
import { AppText } from '@/components/ui/AppText';
import { Button, IconButton } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { promptDialog } from '@/components/ui/dialogs';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { openCardDetail } from '@/features/cards/detailStore';
import { displayName } from '@/features/cards/labels';
import { pickCards, type PickerSection } from '@/features/cards/pickerStore';
import { useCards } from '@/features/cards/useCards';
import { boardAfter } from '@/features/combos/state';
import { useCombo, useCombos } from '@/features/combos/store';
import type { Combo, ComboStep } from '@/features/combos/types';
import { useDecks } from '@/features/decks/store';
import { useSettings } from '@/features/settings/store';
import { colors, radius, spacing } from '@/theme';

export default function ComboEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const combo = useCombo(id);
  const decks = useDecks((s) => s.decks);
  const review = useCombos((s) => s.reviews[id]);
  const language = useSettings((s) => s.language);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const deck = decks.find((d) => d.id === combo?.deckId);

  const ids = useMemo(
    () => (combo ? [...combo.startingHand, ...combo.endBoard, ...combo.steps.flatMap((s) => [s.cardId, ...s.targets])] : []),
    [combo]
  );
  const cards = useCards([...ids, ...(deck ? [...deck.main, ...deck.extra] : [])]);
  const nameOf = (cardId: number) => {
    const card = cards.get(cardId);
    return card ? displayName(card, language) : `#${cardId}`;
  };

  if (!combo) {
    return (
      <View style={styles.center}>
        <AppText variant="muted">Combo nicht gefunden.</AppText>
      </View>
    );
  }

  const save = (patch: Partial<Combo>) => useCombos.getState().save({ ...combo, ...patch });

  const sectionsBefore = (stepIndex: number): PickerSection[] => {
    const board = boardAfter(combo, stepIndex);
    const comboCards = [...new Set(ids)];
    return [
      { title: 'Hand', ids: board.hand },
      { title: 'Feld', ids: [...board.field, ...board.material] },
      { title: 'Friedhof', ids: [...board.gy, ...board.banished] },
      ...(deck ? [{ title: 'Extra Deck', ids: deck.extra }, { title: 'Main Deck', ids: deck.main }] : []),
      { title: 'In dieser Combo', ids: comboCards },
    ];
  };

  const pickStartingHand = async () => {
    const result = await pickCards({
      title: 'Starthand',
      multiple: true,
      initial: combo.startingHand,
      sections: deck ? [{ title: 'Main Deck', ids: deck.main }] : [],
    });
    if (result) save({ startingHand: result });
  };

  const pickEndBoard = async () => {
    const result = await pickCards({ title: 'Endboard', multiple: true, initial: combo.endBoard, sections: sectionsBefore(combo.steps.length) });
    if (result) save({ endBoard: result });
  };

  const saveStep = (step: ComboStep) => {
    const steps = [...combo.steps];
    if (editing === 'new') steps.push(step);
    else if (typeof editing === 'number') steps[editing] = step;
    save({ steps });
    setEditing(null);
  };

  const moveStep = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= combo.steps.length) return;
    const steps = [...combo.steps];
    [steps[index], steps[target]] = [steps[target], steps[index]];
    save({ steps });
  };

  const rename = async () => {
    const name = await promptDialog({ title: 'Combo umbenennen', defaultValue: combo.name });
    if (name) save({ name });
  };

  const finalBoard = boardAfter(combo, combo.steps.length);

  return (
    <Screen maxWidth={1000}>
      <Stack.Screen
        options={{
          title: combo.name,
          headerRight: () => (
            <View style={styles.headerActions}>
              <IconButton icon="create-outline" label="Umbenennen" onPress={rename} />
              <IconButton
                icon="play"
                label="Quiz starten"
                disabled={combo.steps.length === 0}
                onPress={() => router.push({ pathname: '/combos/quiz/[id]', params: { id: combo.id, mode: 'choice' } })}
                testID="editor-quiz"
              />
            </View>
          ),
        }}
      />

      <Section title="Deck">
        <View style={styles.chips}>
          <Chip label="Ohne Deck" selected={combo.deckId === null} onPress={() => save({ deckId: null })} />
          {decks.map((d) => (
            <Chip key={d.id} label={d.name} selected={combo.deckId === d.id} onPress={() => save({ deckId: d.id })} testID={`combo-deck-${d.id}`} />
          ))}
        </View>
        <AppText variant="small">Mit Deck schlägt die Kartenauswahl die Karten aus Main und Extra Deck vor.</AppText>
      </Section>

      <Section title={`Starthand (${combo.startingHand.length})`}>
        <CardRow ids={combo.startingHand} cards={cards} onRemove={(i) => save({ startingHand: combo.startingHand.filter((_, j) => j !== i) })} />
        <Button testID="pick-starting-hand" label="Karten wählen" icon="albums-outline" size="sm" onPress={pickStartingHand} style={{ alignSelf: 'flex-start' }} />
      </Section>

      <Section title={`Schritte (${combo.steps.length})`}>
        {combo.steps.map((step, index) =>
          editing === index ? (
            <StepEditor key={step.id} initial={step} sections={sectionsBefore(index)} cards={cards} nameOf={nameOf} onSave={saveStep} onCancel={() => setEditing(null)} />
          ) : (
            <StepRow
              key={step.id}
              testID={`combo-step-${index}`}
              step={step}
              index={index}
              cards={cards}
              nameOf={nameOf}
              errors={review?.stepErrors[step.id]}
              actions={
                <>
                  <IconButton icon="create-outline" label="Bearbeiten" size={18} onPress={() => setEditing(index)} />
                  <IconButton icon="arrow-up" label="Nach oben" size={18} disabled={index === 0} onPress={() => moveStep(index, -1)} />
                  <IconButton icon="arrow-down" label="Nach unten" size={18} disabled={index === combo.steps.length - 1} onPress={() => moveStep(index, 1)} />
                  <IconButton icon="trash-outline" label="Löschen" size={18} color={colors.danger} onPress={() => save({ steps: combo.steps.filter((_, j) => j !== index) })} />
                </>
              }
            />
          )
        )}
        {editing === 'new' ? (
          <StepEditor initial={null} sections={sectionsBefore(combo.steps.length)} cards={cards} nameOf={nameOf} onSave={saveStep} onCancel={() => setEditing(null)} />
        ) : (
          <Button testID="add-step" label="Schritt hinzufügen" icon="add" variant="primary" size="sm" onPress={() => setEditing('new')} style={{ alignSelf: 'flex-start' }} disabled={editing !== null} />
        )}
      </Section>

      {combo.steps.length > 0 ? (
        <Section title="Stand nach allen Schritten">
          <ZoneBoard board={finalBoard} cards={cards} tileWidth={60} />
        </Section>
      ) : null}

      <Section title={`Endboard (${combo.endBoard.length})`}>
        <CardRow ids={combo.endBoard} cards={cards} onRemove={(i) => save({ endBoard: combo.endBoard.filter((_, j) => j !== i) })} />
        <View style={styles.chips}>
          <Button
            testID="endboard-from-field"
            label="Feld übernehmen"
            icon="download-outline"
            size="sm"
            disabled={finalBoard.field.length === 0}
            onPress={() => save({ endBoard: [...finalBoard.field] })}
          />
          <Button label="Karten wählen" icon="albums-outline" size="sm" onPress={pickEndBoard} />
        </View>
      </Section>

      <Section title="Notizen">
        <TextField
          multiline
          value={notes ?? combo.notes}
          onChangeText={setNotes}
          onBlur={() => {
            if (notes !== null && notes !== combo.notes) save({ notes });
          }}
          placeholder="Was dieses Board kann, Schwachstellen, Alternativen …"
        />
      </Section>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <AppText variant="label">{title}</AppText>
      {children}
    </View>
  );
}

function CardRow({ ids, cards, onRemove }: { ids: number[]; cards: ReturnType<typeof useCards>; onRemove: (index: number) => void }) {
  if (ids.length === 0) return <AppText variant="small">Noch keine Karten.</AppText>;
  return (
    <View style={styles.cardRow}>
      {ids.map((cardId, index) => {
        const card = cards.get(cardId);
        return (
          <View key={`${cardId}-${index}`} style={{ width: 76, gap: 4 }}>
            {card ? <CardTile card={card} width={76} onPress={() => openCardDetail(cardId, { sequence: ids })} /> : <AppText variant="small">#{cardId}</AppText>}
            <Button label="Entfernen" size="sm" variant="ghost" onPress={() => onRemove(index)} />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  headerActions: { flexDirection: 'row', gap: 2 },
  section: { gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cardRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
