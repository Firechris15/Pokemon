import type { HandCounts } from './probability';
import { isPlayable } from './stats';
import { metaOf, type DeckMeta, type HandTag } from './tags';

export type HandClassification = {
  /** Starters in hand, best (lowest rank) first. */
  starters: number[];
  extenders: number[];
  handtraps: number[];
  bricks: number[];
  breakers: number[];
  playable: boolean;
  /** The card the player should open with, or null if the hand is not playable. */
  best: number | null;
  /** Cards that count as the right choice (ties, or any breaker when going second without starter). */
  acceptable: number[];
};

/** HandCounts for a concrete hand of card ids. */
export function countsOfHand(hand: number[], meta: DeckMeta): HandCounts {
  const tagsOf = (id: number) => metaOf(meta, id).tags;
  return {
    size: hand.length,
    count: (tag) => hand.filter((id) => tagsOf(id).includes(tag)).length,
    countAny: (...tags) => hand.filter((id) => tags.some((tag) => tagsOf(id).includes(tag))).length,
  };
}

export function classifyHand(hand: number[], meta: DeckMeta, goingFirst: boolean): HandClassification {
  const withTag = (tag: HandTag) => hand.filter((id, i) => hand.indexOf(id) === i && metaOf(meta, id).tags.includes(tag));
  const rank = (id: number) => metaOf(meta, id).starterRank ?? Number.MAX_SAFE_INTEGER;
  const starters = withTag('starter').sort((a, b) => rank(a) - rank(b));
  const breakers = withTag('breaker');
  const playable = isPlayable(countsOfHand(hand, meta), goingFirst);

  let best: number | null = null;
  let acceptable: number[] = [];
  if (starters.length > 0) {
    best = starters[0];
    acceptable = starters.filter((id) => rank(id) === rank(best!));
  } else if (playable && breakers.length > 0) {
    best = breakers[0];
    acceptable = breakers;
  }

  return {
    starters,
    extenders: withTag('extender'),
    handtraps: withTag('handtrap'),
    bricks: withTag('brick'),
    breakers,
    playable,
    best,
    acceptable,
  };
}

export type PracticeAnswer = {
  playable: boolean;
  /** Card the player would start with (only when answering "playable"). */
  cardId: number | null;
};

export type PracticeResult = {
  correct: boolean;
  playableCorrect: boolean;
  cardVerdict: 'best' | 'other-starter' | 'wrong' | 'not-asked';
  classification: HandClassification;
  messages: string[];
};

/** Grades a practice answer against the user's own tags and starter ranking. */
export function evaluatePractice(
  hand: number[],
  meta: DeckMeta,
  goingFirst: boolean,
  answer: PracticeAnswer,
  nameOf: (id: number) => string
): PracticeResult {
  const c = classifyHand(hand, meta, goingFirst);
  const names = (ids: number[]) => ids.map(nameOf).join(', ');
  const messages: string[] = [];
  const playableCorrect = answer.playable === c.playable;

  if (c.playable) {
    if (c.starters.length > 0) messages.push(`Starter in der Hand: ${names(c.starters)}.`);
    else messages.push(`Kein Starter, aber Board-Breaker in der Hand: ${names(c.breakers)}.`);
  } else {
    messages.push(goingFirst ? 'Kein Starter in der Hand – die Hand ist nicht spielbar.' : 'Weder Starter noch Board-Breaker in der Hand – die Hand ist nicht spielbar.');
  }
  if (c.bricks.length > 0) messages.push(`Bricks: ${names(c.bricks)}.`);
  if (c.handtraps.length > 0) messages.push(`Handtraps für den gegnerischen Zug: ${names(c.handtraps)}.`);

  let cardVerdict: PracticeResult['cardVerdict'] = 'not-asked';
  if (c.playable && answer.playable) {
    if (answer.cardId !== null && c.acceptable.includes(answer.cardId)) {
      cardVerdict = 'best';
      messages.unshift(`Richtig: ${nameOf(answer.cardId)} ist die beste Wahl.`);
    } else if (answer.cardId !== null && c.starters.includes(answer.cardId)) {
      cardVerdict = 'other-starter';
      messages.unshift(`${nameOf(answer.cardId)} ist auch ein Starter, laut deiner Rangliste ist ${nameOf(c.best!)} aber besser.`);
    } else {
      cardVerdict = 'wrong';
      const chosen = answer.cardId !== null ? `${nameOf(answer.cardId)} ist kein Starter. ` : '';
      messages.unshift(`${chosen}Die beste Wahl wäre ${nameOf(c.best!)}.`);
    }
  } else if (!playableCorrect) {
    const missing = goingFirst ? 'dir fehlt ein Starter' : 'dir fehlen Starter und Board-Breaker';
    messages.unshift(c.playable ? `Doch spielbar – beste Wahl: ${nameOf(c.best!)}.` : `Nicht spielbar – ${missing}.`);
  } else {
    messages.unshift('Richtig: Die Hand ist nicht spielbar.');
  }

  const correct = playableCorrect && (cardVerdict === 'best' || cardVerdict === 'not-asked');
  return { correct, playableCorrect, cardVerdict, classification: c, messages };
}
