import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { CardImage } from '@/components/cards/CardImage';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { TextField } from '@/components/ui/TextField';
import { pickCards, type PickerSection } from '@/features/cards/pickerStore';
import type { Card } from '@/features/cards/types';
import { ACTION_LABELS, ACTIONS, defaultMoves, TARGET_LABELS, ZONE_LABELS } from '@/features/combos/actions';
import type { ComboAction, ComboStep, Zone } from '@/features/combos/types';
import { createId } from '@/lib/id';
import { colors, radius, spacing } from '@/theme';

const ZONE_CHOICES: (Zone | null)[] = [null, 'field', 'hand', 'gy', 'banished', 'material', 'deck', 'extra'];

/** Create or edit one combo step. */
export function StepEditor({
  initial,
  sections,
  cards,
  nameOf,
  onSave,
  onCancel,
}: {
  initial: ComboStep | null;
  /** Quick-pick sections for the card pickers (board before this step, deck …). */
  sections: PickerSection[];
  cards: Map<number, Card>;
  nameOf: (id: number) => string;
  onSave: (step: ComboStep) => void;
  onCancel: () => void;
}) {
  const [cardId, setCardId] = useState<number | null>(initial?.cardId ?? null);
  const [action, setAction] = useState<ComboAction>(initial?.action ?? 'normal_summon');
  const [targets, setTargets] = useState<number[]>(initial?.targets ?? []);
  const [cardTo, setCardTo] = useState<Zone | null>(initial?.cardTo ?? 'field');
  const [targetsTo, setTargetsTo] = useState<Zone | null>(initial?.targetsTo ?? 'gy');
  const [movesTouched, setMovesTouched] = useState(initial !== null);
  const [note, setNote] = useState(initial?.note ?? '');

  // Until the user changes the zones by hand, follow the defaults for the action.
  const applyDefaults = (nextAction: ComboAction, nextCard: number | null) => {
    if (movesTouched) return;
    const moves = defaultMoves(nextAction, nextCard !== null ? cards.get(nextCard) : null);
    setCardTo(moves.cardTo);
    setTargetsTo(moves.targetsTo);
  };

  const chooseCard = async () => {
    const result = await pickCards({ title: 'Karte für diesen Schritt', sections });
    if (result?.[0] !== undefined) {
      setCardId(result[0]);
      applyDefaults(action, result[0]);
    }
  };

  const chooseTargets = async () => {
    const result = await pickCards({ title: TARGET_LABELS[action], sections, multiple: true, initial: targets });
    if (result) setTargets(result);
  };

  const save = () => {
    if (cardId === null) return;
    onSave({ id: initial?.id ?? createId(), cardId, action, targets, cardTo, targetsTo, note: note.trim() });
  };

  const card = cardId !== null ? cards.get(cardId) : undefined;

  return (
    <View style={styles.editor} testID="step-editor">
      <AppText variant="label">{initial ? 'Schritt bearbeiten' : 'Neuer Schritt'}</AppText>

      <View style={styles.cardRow}>
        {cardId !== null ? (
          <CardImage imageId={card?.imageIds[0] ?? cardId} size="small" width={48} name={nameOf(cardId)} frameType={card?.frameType} />
        ) : null}
        <View style={{ flex: 1, gap: 4 }}>
          <AppText style={{ fontWeight: '700' }}>{cardId !== null ? nameOf(cardId) : 'Noch keine Karte gewählt'}</AppText>
          <Button testID="step-choose-card" label={cardId !== null ? 'Andere Karte' : 'Karte wählen'} icon="albums-outline" size="sm" onPress={chooseCard} style={{ alignSelf: 'flex-start' }} />
        </View>
      </View>

      <View style={styles.block}>
        <AppText variant="label">Aktion</AppText>
        <View style={styles.chips}>
          {ACTIONS.map((a) => (
            <Chip
              key={a}
              testID={`step-action-${a}`}
              label={ACTION_LABELS[a]}
              selected={action === a}
              onPress={() => {
                setAction(a);
                applyDefaults(a, cardId);
              }}
            />
          ))}
        </View>
      </View>

      <View style={styles.block}>
        <AppText variant="label">{TARGET_LABELS[action]} (optional)</AppText>
        <AppText variant="small">{targets.length > 0 ? targets.map(nameOf).join(', ') : 'Keine'}</AppText>
        <Button testID="step-choose-targets" label="Karten wählen" icon="layers-outline" size="sm" onPress={chooseTargets} style={{ alignSelf: 'flex-start' }} />
      </View>

      <ZonePicker
        label="Karte danach"
        value={cardTo}
        onChange={(zone) => {
          setMovesTouched(true);
          setCardTo(zone);
        }}
      />
      {targets.length > 0 ? (
        <ZonePicker
          label={`${TARGET_LABELS[action]} danach`}
          value={targetsTo}
          onChange={(zone) => {
            setMovesTouched(true);
            setTargetsTo(zone);
          }}
        />
      ) : null}

      <View style={styles.block}>
        <AppText variant="label">Erklärung (wird im Quiz nach der Antwort gezeigt)</AppText>
        <TextField testID="step-note" value={note} onChangeText={setNote} placeholder="Warum dieser Schritt? z. B. „Ash zuerst, damit Poplar …“" multiline />
      </View>

      <View style={styles.chips}>
        <Button testID="step-save" label="Schritt übernehmen" icon="checkmark" variant="primary" onPress={save} disabled={cardId === null} />
        <Button label="Abbrechen" variant="ghost" onPress={onCancel} />
      </View>
    </View>
  );
}

function ZonePicker({ label, value, onChange }: { label: string; value: Zone | null; onChange: (zone: Zone | null) => void }) {
  return (
    <View style={styles.block}>
      <AppText variant="label">{label}</AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {ZONE_CHOICES.map((zone) => (
          <Chip key={zone ?? 'stay'} label={zone === null ? 'Bleibt' : ZONE_LABELS[zone]} selected={value === zone} onPress={() => onChange(zone)} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  editor: { gap: spacing.md, backgroundColor: colors.surfaceAlt, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  block: { gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
