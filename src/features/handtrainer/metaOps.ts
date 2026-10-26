import { HAND_TAGS, metaOf, type DeckMeta, type HandTag } from './tags';

export type MetaChange = { meta: DeckMeta; changed: number[] };

/** Starters ordered by their priority (best first). */
export function rankedStarters(meta: DeckMeta, inDeck?: Set<number>): number[] {
  return Object.entries(meta)
    .filter(([id, m]) => m.tags.includes('starter') && (!inDeck || inDeck.has(Number(id))))
    .sort(([a, ma], [b, mb]) => (ma.starterRank ?? 1e9) - (mb.starterRank ?? 1e9) || Number(a) - Number(b))
    .map(([id]) => Number(id));
}

/** Renumbers starter ranks 1..n in the given order. */
export function setStarterOrder(meta: DeckMeta, ordered: number[]): MetaChange {
  const next: DeckMeta = { ...meta };
  const changed: number[] = [];
  ordered.forEach((id, index) => {
    const current = metaOf(next, id);
    if (current.starterRank !== index + 1) {
      next[id] = { ...current, starterRank: index + 1 };
      changed.push(id);
    }
  });
  return { meta: next, changed };
}

/** Adds or removes a tag; new starters go to the end of the priority list. */
export function toggleTag(meta: DeckMeta, cardId: number, tag: HandTag): MetaChange {
  const current = metaOf(meta, cardId);
  const has = current.tags.includes(tag);
  const tags = has ? current.tags.filter((t) => t !== tag) : HAND_TAGS.filter((t) => t === tag || current.tags.includes(t));
  let next: DeckMeta = { ...meta, [cardId]: { ...current, tags } };
  const changed = [cardId];

  if (tag === 'starter') {
    if (has) {
      next[cardId] = { ...next[cardId], starterRank: null };
      const reordered = setStarterOrder(next, rankedStarters(next));
      next = reordered.meta;
      changed.push(...reordered.changed);
    } else {
      const ranks = rankedStarters(meta).map((id) => metaOf(meta, id).starterRank ?? 0);
      next[cardId] = { ...next[cardId], starterRank: Math.max(0, ...ranks) + 1 };
    }
  }
  if (next[cardId].tags.length === 0) delete next[cardId];
  return { meta: next, changed: [...new Set(changed)] };
}

/** Moves a starter up (-1) or down (+1) within the given visible order. */
export function moveStarter(meta: DeckMeta, ordered: number[], cardId: number, delta: -1 | 1): MetaChange {
  const index = ordered.indexOf(cardId);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= ordered.length) return { meta, changed: [] };
  const swapped = [...ordered];
  [swapped[index], swapped[target]] = [swapped[target], swapped[index]];
  return setStarterOrder(meta, swapped);
}
