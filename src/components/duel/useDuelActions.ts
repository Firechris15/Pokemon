import { Platform } from 'react-native';

import { chooseOption, showToast } from '@/components/ui/dialogs';
import { openCardDetail } from '@/features/cards/detailStore';
import { displayName } from '@/features/cards/labels';
import type { Card } from '@/features/cards/types';
import type { Intent } from '@/features/duel/builder';
import { applySelection, cardOptions, dropOptions, type ActionOption } from '@/features/duel/interactions';
import { ZONE_NAMES } from '@/features/duel/moves';
import { selectInstances, showPile, type SheetItem } from '@/features/duel/sheetStore';
import { locate } from '@/features/duel/state';
import type { DuelState, Location, PileZone, Side } from '@/features/duel/types';
import { useSettings } from '@/features/settings/store';

/** iOS cannot present a modal while the previous one is still closing. */
export const afterModal = () => new Promise((resolve) => setTimeout(resolve, Platform.OS === 'ios' ? 450 : 0));

/**
 * Turns taps and drag & drop on the duel board into move intents: shows the
 * possible actions, asks for materials/targets and hands the intent over.
 */
export function useDuelActions({
  state,
  cards,
  actor,
  onIntent,
}: {
  state: DuelState;
  cards: Map<number, Card>;
  /** 'me' while solving; null in the editor (the card's controller acts). */
  actor: Side | null;
  onIntent: (intent: Intent) => void;
}) {
  const language = useSettings((s) => s.language);
  const cardOf = (id: number) => cards.get(id);
  const nameOf = (id: number) => {
    const card = cards.get(id);
    return card ? displayName(card, language) : `#${id}`;
  };
  const ctx = { state, cardOf, actor };
  const hidden = (uid: string) => {
    const found = locate(state, uid);
    if (!found || actor === null || found.loc.side === 'me') return false;
    const { zone } = found.loc;
    if (zone === 'deck' || zone === 'extra') return true;
    return zone === 'hand' ? !found.card.revealed : !found.card.faceUp && !found.card.revealed;
  };

  const items = (uids: string[]): SheetItem[] =>
    uids.flatMap((uid) => {
      const found = locate(state, uid);
      if (!found) return [];
      const caption = `${ZONE_NAMES[found.loc.zone]}${found.loc.side === 'opp' ? ' (Gegner)' : ''}`;
      return [{ uid, cardId: found.card.cardId, faceDown: hidden(uid), caption }];
    });

  const run = async (option: ActionOption) => {
    let intent = option.intent;
    if (option.select) {
      const { title, candidates, min, max, field } = option.select;
      if (candidates.length < min) {
        showToast(`Nicht genug Karten verfügbar (${title}).`, 'error');
        return;
      }
      await afterModal();
      const chosen = await selectInstances({ title, items: items(candidates), min, max: Math.min(max, candidates.length) });
      if (!chosen) return;
      intent = applySelection(intent, field, chosen);
    }
    onIntent(intent);
  };

  const choose = async (title: string, options: ActionOption[], cardId?: number) => {
    const DETAILS = '__details';
    const value = await chooseOption<string>({
      title,
      options: [
        ...options.map((o) => ({ label: o.label, value: o.key, testID: `action-${o.key}` })),
        ...(cardId !== undefined ? [{ label: 'Kartendetails', value: DETAILS, icon: 'information-circle-outline' as const, testID: 'action-details' }] : []),
      ],
    });
    if (value === DETAILS && cardId !== undefined) {
      await afterModal();
      openCardDetail(cardId);
    }
    const option = options.find((o) => o.key === value);
    if (option) await run(option);
  };

  const onDrop = (uid: string, target: Location) => {
    const found = locate(state, uid);
    if (!found) return;
    const options = dropOptions(ctx, uid, target);
    if (options.length === 0) {
      showToast('Das geht hier nicht.', 'error');
      return;
    }
    if (options.length === 1) {
      run(options[0]);
      return;
    }
    choose(hidden(uid) ? 'Verdeckte Karte' : nameOf(found.card.cardId), options);
  };

  const onCardPress = (uid: string) => {
    const found = locate(state, uid);
    if (!found) return;
    const secret = hidden(uid);
    choose(secret ? 'Verdeckte Karte' : nameOf(found.card.cardId), cardOptions(ctx, uid), secret ? undefined : found.card.cardId);
  };

  const onPilePress = async (side: Side, zone: PileZone) => {
    const list = state[side][zone];
    const title = `${ZONE_NAMES[zone]}${side === 'opp' ? ' des Gegners' : ''}`;
    if (list.length === 0) {
      showToast(`${title}: leer`);
      return;
    }
    if (actor !== null && side === 'opp' && (zone === 'deck' || zone === 'extra')) {
      showToast(`${title}: ${list.length} verdeckte Karten`);
      return;
    }
    const uid = await showPile({ title: `${title} (${list.length})`, items: items([...list].reverse().map((c) => c.uid)) });
    if (!uid || uid === 'action') return;
    await afterModal();
    onCardPress(uid);
  };

  return { onDrop, onCardPress, onPilePress, nameOf };
}
