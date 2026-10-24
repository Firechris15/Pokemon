import { useEffect, useMemo, useState } from 'react';

import { getCachedCard, getCardsByIds } from './repository';
import { useCardDb } from './store';
import type { Card } from './types';

/**
 * Loads the given cards from the local database, reloading after a sync.
 * Cards already in the in-memory cache (e.g. just picked from search
 * results) are available immediately, so newly added cards never flash
 * as "unknown".
 */
export function useCards(ids: number[]): Map<number, Card> {
  const revision = useCardDb((s) => s.revision);
  const key = useMemo(() => [...new Set(ids)].sort((a, b) => a - b).join(','), [ids]);
  const [loaded, setLoaded] = useState<Map<number, Card>>(new Map());

  useEffect(() => {
    let active = true;
    const unique = key ? key.split(',').map(Number) : [];
    getCardsByIds(unique)
      .then((map) => active && setLoaded(map))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [key, revision]);

  return useMemo(() => {
    const unique = key ? key.split(',').map(Number) : [];
    if (unique.every((id) => loaded.has(id))) return loaded;
    const merged = new Map(loaded);
    for (const id of unique) {
      const cached = merged.get(id) ?? getCachedCard(id);
      if (cached) merged.set(id, cached);
    }
    return merged;
  }, [key, loaded]);
}
