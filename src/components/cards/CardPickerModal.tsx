import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Button, IconButton } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { displayName } from '@/features/cards/labels';
import { closeCardPicker, useCardPicker, type PickerRequest } from '@/features/cards/pickerStore';
import { useCards } from '@/features/cards/useCards';
import { useSettings } from '@/features/settings/store';
import { colors, radius, spacing } from '@/theme';

import { CardChoiceGrid } from './CardChoiceGrid';
import { CardSearchPanel } from './CardSearchPanel';

/** Global card picker, opened with pickCards(). */
export function CardPickerModal() {
  const request = useCardPicker((s) => s.request);
  return (
    <Modal visible={request !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => closeCardPicker(null)}>
      {request ? <PickerContent key={request.id} request={request} /> : null}
    </Modal>
  );
}

function PickerContent({ request }: { request: PickerRequest }) {
  const insets = useSafeAreaInsets();
  const language = useSettings((s) => s.language);
  const [selected, setSelected] = useState<number[]>(request.initial);
  const [tab, setTab] = useState(request.sections.length > 0 ? 0 : -1);
  const [width, setWidth] = useState(0);
  const sectionIds = useMemo(() => request.sections.flatMap((s) => s.ids), [request.sections]);
  const cards = useCards([...sectionIds, ...selected]);
  const nameOf = (id: number) => {
    const card = cards.get(id);
    return card ? displayName(card, language) : `#${id}`;
  };

  const choose = (id: number) => {
    if (!request.multiple) closeCardPicker([id]);
    else setSelected((list) => [...list, id]);
  };
  const removeAt = (index: number) => setSelected((list) => list.filter((_, i) => i !== index));

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom }]} testID="card-picker">
      <View style={styles.header}>
        <Button label="Abbrechen" variant="ghost" onPress={() => closeCardPicker(null)} />
        <AppText variant="title" style={styles.title} numberOfLines={1}>
          {request.title}
        </AppText>
        {request.multiple ? (
          <Button testID="picker-done" label={`Übernehmen (${selected.length})`} variant="primary" onPress={() => closeCardPicker(selected)} />
        ) : (
          <View style={{ width: 90 }} />
        )}
      </View>

      {request.multiple ? (
        <ScrollView horizontal style={styles.selectedStrip} contentContainerStyle={styles.selectedContent} showsHorizontalScrollIndicator={false}>
          {selected.length === 0 ? <AppText variant="small">Noch nichts gewählt – tippe Karten an (mehrfach = mehrere Kopien).</AppText> : null}
          {selected.map((id, index) => (
            <Pressable key={`${id}-${index}`} onPress={() => removeAt(index)} style={styles.selectedChip} accessibilityLabel={`${nameOf(id)} entfernen`}>
              <Text style={styles.selectedText} numberOfLines={1}>
                {nameOf(id)}
              </Text>
              <Text style={styles.selectedX}>✕</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.tabs}>
        {request.sections.map((section, index) => (
          <Chip key={section.title} label={`${section.title} (${new Set(section.ids).size})`} selected={tab === index} onPress={() => setTab(index)} testID={`picker-tab-${index}`} />
        ))}
        <Chip label="Suche" selected={tab === -1} onPress={() => setTab(-1)} testID="picker-tab-search" />
      </View>

      <View style={styles.body} onLayout={(e) => setWidth(e.nativeEvent.layout.width - spacing.lg * 2)}>
        {tab === -1 ? (
          <View style={styles.search}>
            <CardSearchPanel
              autoFocus={request.sections.length === 0}
              renderActions={(card) => (
                <IconButton icon="add-circle" color={colors.primary} size={28} label="Wählen" onPress={() => choose(card.id)} testID={`picker-add-${card.id}`} />
              )}
            />
          </View>
        ) : width > 0 ? (
          <ScrollView contentContainerStyle={styles.gridContent}>
            <CardChoiceGrid
              ids={request.sections[tab]?.ids ?? []}
              cards={cards}
              width={width}
              selected={(id) => selected.includes(id)}
              onChoose={choose}
              testIDPrefix="picker-card"
            />
          </ScrollView>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, gap: spacing.sm },
  title: { flex: 1, textAlign: 'center' },
  selectedStrip: { flexGrow: 0, marginTop: spacing.sm },
  selectedContent: { gap: spacing.sm, paddingHorizontal: spacing.lg, alignItems: 'center', minHeight: 36 },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    maxWidth: 240,
  },
  selectedText: { color: colors.text, fontWeight: '600', fontSize: 13, flexShrink: 1 },
  selectedX: { color: colors.textMuted, fontSize: 12 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, padding: spacing.lg, paddingBottom: spacing.sm },
  body: { flex: 1 },
  search: { flex: 1, paddingHorizontal: spacing.lg },
  gridContent: { padding: spacing.lg, paddingTop: spacing.sm },
});
