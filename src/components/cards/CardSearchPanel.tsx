import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { TextField } from '@/components/ui/TextField';
import { openCardDetail, type CardActionsComponent } from '@/features/cards/detailStore';
import {
  ATTRIBUTE_LABELS,
  ATTRIBUTES,
  CLASS_LABELS,
  FRAME_FILTER_LABELS,
  labelForRace,
  PROPERTY_LABELS,
  SPELL_PROPERTIES,
  TRAP_PROPERTIES,
} from '@/features/cards/labels';
import { getArchetypes, getMonsterRaces, searchCards } from '@/features/cards/repository';
import { useCardDb } from '@/features/cards/store';
import { EMPTY_FILTER, type Card, type CardSearchFilter, type MonsterFrameFilter } from '@/features/cards/types';
import { useSettings } from '@/features/settings/store';
import { foldForSearch } from '@/lib/text';
import { colors, radius, spacing } from '@/theme';

import { CardListItem } from './CardListItem';

const PAGE = 60;
const FRAMES: MonsterFrameFilter[] = ['main', 'extra', 'normal', 'effect', 'ritual', 'fusion', 'synchro', 'xyz', 'link', 'pendulum', 'tuner'];
const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

type Props = {
  /** Extra buttons per result row, e.g. "add to deck". */
  renderActions?: (card: Card) => ReactNode;
  /** Actions shown in the large card view when opened from the results. */
  detailActions?: CardActionsComponent;
  /** Hide tokens and skill cards. */
  deckCardsOnly?: boolean;
  autoFocus?: boolean;
};

export function CardSearchPanel({ renderActions, detailActions, deckCardsOnly, autoFocus }: Props) {
  const [filter, setFilter] = useState<CardSearchFilter>(EMPTY_FILTER);
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState<{ key: string; cards: Card[]; hasMore: boolean }>({ key: '', cards: [], hasMore: false });
  const [loadingMore, setLoadingMore] = useState(false);
  const banlist = useSettings((s) => s.banlist);
  const language = useSettings((s) => s.language);
  const revision = useCardDb((s) => s.revision);
  const cardCount = useCardDb((s) => s.cardCount);
  const requestId = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(filter.query), 220);
    return () => clearTimeout(timer);
  }, [filter.query]);

  const effectiveFilter = useMemo(() => ({ ...filter, query: debouncedQuery }), [filter, debouncedQuery]);
  const queryKey = JSON.stringify([effectiveFilter, banlist, language, deckCardsOnly, revision]);
  const results = page.cards;
  const loading = page.key !== queryKey || loadingMore;

  useEffect(() => {
    const id = ++requestId.current;
    searchCards(effectiveFilter, { banlist, language, deckCardsOnly, limit: PAGE, offset: 0 })
      .then((cards) => id === requestId.current && setPage({ key: queryKey, cards, hasMore: cards.length === PAGE }))
      .catch(() => id === requestId.current && setPage({ key: queryKey, cards: [], hasMore: false }));
  }, [effectiveFilter, banlist, language, deckCardsOnly, queryKey]);

  const loadMore = () => {
    if (loading || !page.hasMore) return;
    const id = ++requestId.current;
    setLoadingMore(true);
    searchCards(effectiveFilter, { banlist, language, deckCardsOnly, limit: PAGE, offset: results.length })
      .then((cards) => {
        if (id !== requestId.current) return;
        setPage((prev) => ({ key: prev.key, cards: [...prev.cards, ...cards], hasMore: cards.length === PAGE }));
      })
      .catch(() => undefined)
      .finally(() => setLoadingMore(false));
  };

  const patch = (change: Partial<CardSearchFilter>) => setFilter((f) => ({ ...f, ...change }));
  const activeFilters = [filter.cardClass, filter.frame, filter.property, filter.attribute, filter.race, filter.level, filter.archetype, filter.legalOnly || null].filter(
    (v) => v !== null && v !== undefined
  ).length;

  const openCard = (card: Card) =>
    openCardDetail(card.id, { sequence: results.map((c) => c.id), actions: detailActions });

  return (
    <View style={styles.root}>
      <View style={styles.searchRow}>
        <TextField
          testID="card-search-input"
          style={{ flex: 1 }}
          icon="search"
          placeholder="Kartenname (DE/EN) oder Passcode"
          value={filter.query}
          onChangeText={(query) => patch({ query })}
          onClear={() => patch({ query: '' })}
          autoFocus={autoFocus}
          returnKeyType="search"
        />
        <Pressable
          testID="toggle-filters"
          accessibilityRole="button"
          accessibilityLabel="Filter"
          onPress={() => setShowFilters((v) => !v)}
          style={[styles.filterButton, (showFilters || activeFilters > 0) && styles.filterButtonActive]}>
          <Ionicons name="options" size={20} color={activeFilters > 0 ? colors.onPrimary : colors.text} />
          {activeFilters > 0 ? <AppText style={styles.filterCount}>{activeFilters}</AppText> : null}
        </Pressable>
      </View>

      <View style={styles.quickRow}>
        <Chip label="Kartentext durchsuchen" selected={filter.searchText} onPress={() => patch({ searchText: !filter.searchText })} />
        <Chip label="Nur erlaubte" selected={filter.legalOnly} onPress={() => patch({ legalOnly: !filter.legalOnly })} />
      </View>

      {showFilters ? <FilterArea filter={filter} patch={patch} reset={() => setFilter({ ...EMPTY_FILTER, query: filter.query })} /> : null}

      {cardCount === 0 ? (
        <AppText variant="muted" style={styles.empty}>
          Noch keine Kartendaten. Bitte auf der Startseite die Kartendatenbank herunterladen.
        </AppText>
      ) : (
        <FlatList
          testID="card-search-results"
          style={styles.list}
          data={results}
          keyExtractor={(card) => String(card.id)}
          renderItem={({ item }) => (
            <CardListItem card={item} onPress={openCard} actions={renderActions?.(item)} testID={`search-result-${item.id}`} />
          )}
          onEndReached={loadMore}
          onEndReachedThreshold={0.6}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          initialNumToRender={14}
          windowSize={7}
          ListEmptyComponent={
            !loading ? (
              <AppText variant="muted" style={styles.empty}>
                Keine Karten gefunden.
              </AppText>
            ) : undefined
          }
          ListFooterComponent={loading ? <ActivityIndicator color={colors.primary} style={{ margin: spacing.lg }} /> : undefined}
        />
      )}
    </View>
  );
}

function FilterArea({
  filter,
  patch,
  reset,
}: {
  filter: CardSearchFilter;
  patch: (change: Partial<CardSearchFilter>) => void;
  reset: () => void;
}) {
  const [races, setRaces] = useState<string[]>([]);
  const [archetypes, setArchetypes] = useState<string[]>([]);
  const [archetypeQuery, setArchetypeQuery] = useState('');
  const revision = useCardDb((s) => s.revision);

  useEffect(() => {
    getMonsterRaces().then(setRaces).catch(() => undefined);
    getArchetypes().then(setArchetypes).catch(() => undefined);
  }, [revision]);

  const archetypeMatches = useMemo(() => {
    const q = foldForSearch(archetypeQuery);
    if (!q) return [];
    return archetypes.filter((a) => foldForSearch(a).includes(q)).slice(0, 12);
  }, [archetypeQuery, archetypes]);

  const isMonster = filter.cardClass === 'monster' || filter.cardClass === null;
  const properties = filter.cardClass === 'spell' ? SPELL_PROPERTIES : filter.cardClass === 'trap' ? TRAP_PROPERTIES : [];

  return (
    <ScrollView style={styles.filtersScroll} contentContainerStyle={styles.filters} testID="filter-area" keyboardShouldPersistTaps="handled">
      <FilterRow label="Kartenart">
        <Chip label="Alle" selected={filter.cardClass === null} onPress={() => patch({ cardClass: null, property: null })} />
        {(['monster', 'spell', 'trap'] as const).map((cls) => (
          <Chip
            key={cls}
            testID={`filter-class-${cls}`}
            label={CLASS_LABELS[cls]}
            selected={filter.cardClass === cls}
            onPress={() =>
              patch({
                cardClass: filter.cardClass === cls ? null : cls,
                property: null,
                ...(cls !== 'monster' ? { frame: null, attribute: null, race: null, level: null } : {}),
              })
            }
          />
        ))}
      </FilterRow>

      {properties.length > 0 ? (
        <FilterRow label="Typ">
          {properties.map((p) => (
            <Chip key={p} label={PROPERTY_LABELS[p]} selected={filter.property === p} onPress={() => patch({ property: filter.property === p ? null : p })} />
          ))}
        </FilterRow>
      ) : null}

      {isMonster ? (
        <>
          <FilterRow label="Monster">
            {FRAMES.map((frame) => (
              <Chip
                key={frame}
                testID={`filter-frame-${frame}`}
                label={FRAME_FILTER_LABELS[frame]}
                selected={filter.frame === frame}
                onPress={() => patch({ frame: filter.frame === frame ? null : frame })}
              />
            ))}
          </FilterRow>
          <FilterRow label="Attribut">
            {ATTRIBUTES.map((a) => (
              <Chip
                key={a}
                testID={`filter-attribute-${a}`}
                label={ATTRIBUTE_LABELS[a]}
                selected={filter.attribute === a}
                onPress={() => patch({ attribute: filter.attribute === a ? null : a })}
              />
            ))}
          </FilterRow>
          <FilterRow label="Stufe / Rang / Link">
            {LEVELS.map((level) => (
              <Chip key={level} label={String(level)} selected={filter.level === level} onPress={() => patch({ level: filter.level === level ? null : level })} />
            ))}
          </FilterRow>
          {races.length > 0 ? (
            <FilterRow label="Monstertyp">
              {races.map((race) => (
                <Chip key={race} label={labelForRace(race)} selected={filter.race === race} onPress={() => patch({ race: filter.race === race ? null : race })} />
              ))}
            </FilterRow>
          ) : null}
        </>
      ) : null}

      <View style={styles.filterBlock}>
        <AppText variant="label">Archetyp</AppText>
        {filter.archetype ? (
          <View style={styles.chipWrap}>
            <Chip label={`${filter.archetype}  ✕`} selected onPress={() => patch({ archetype: null })} testID="filter-archetype-selected" />
          </View>
        ) : (
          <>
            <TextField
              testID="archetype-input"
              icon="pricetag"
              placeholder="Archetyp suchen, z. B. Snake-Eye"
              value={archetypeQuery}
              onChangeText={setArchetypeQuery}
              onClear={() => setArchetypeQuery('')}
            />
            {archetypeMatches.length > 0 ? (
              <View style={styles.chipWrap}>
                {archetypeMatches.map((a) => (
                  <Chip
                    key={a}
                    label={a}
                    onPress={() => {
                      patch({ archetype: a });
                      setArchetypeQuery('');
                    }}
                  />
                ))}
              </View>
            ) : null}
          </>
        )}
      </View>

      <Button label="Filter zurücksetzen" icon="refresh" size="sm" variant="ghost" onPress={reset} style={{ alignSelf: 'flex-start' }} />
    </ScrollView>
  );
}

function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.filterBlock}>
      <AppText variant="label">{label}</AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: spacing.sm },
  searchRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  quickRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 42,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
  },
  filterButtonActive: { backgroundColor: colors.primary },
  filterCount: { color: colors.onPrimary, fontWeight: '800' },
  filtersScroll: { maxHeight: 380, flexGrow: 0, backgroundColor: colors.surface, borderRadius: radius.md },
  filters: { gap: spacing.md, padding: spacing.md },
  filterBlock: { gap: 6 },
  chipRow: { gap: 6, paddingRight: spacing.lg },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  list: { flex: 1 },
  empty: { textAlign: 'center', padding: spacing.xl },
});
