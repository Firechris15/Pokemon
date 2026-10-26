import { emptyDuel, newInstance } from '@/features/duel/state';
import type { CardInstance, DuelMove, DuelState, Location, MoveAction, Side, SlotZone, ZoneType } from '@/features/duel/types';

import { DIFFICULTY_RATING } from './rating';
import type { Difficulty, Puzzle, PuzzleGoal } from './types';

/** Passcodes of the cards used by the sample puzzles. */
export const C = {
  blueEyes: 89631139,
  raigeki: 12580477,
  celtic: 91152256,
  skull: 70781052,
  darkMagician: 46986414,
  mst: 5318639,
  mirrorForce: 44095762,
  reinforcement: 32807846,
  foolish: 81439173,
  reborn: 83764718,
  ash: 14558127,
  poly: 24094653,
  timeWizard: 71625222,
  babyDragon: 88819587,
  thousandDragon: 41462083,
  changeOfHeart: 4031928,
} as const;

/** Bump when samples are added, so existing installs receive them. */
export const SAMPLES_VERSION = 1;

type Slot = number | { id: number; defense?: boolean; faceUp?: boolean; revealed?: boolean } | null;
type SideSpec = {
  lp?: number;
  hand?: (number | { id: number; revealed: boolean })[];
  monster?: Slot[];
  spell?: Slot[];
  gy?: number[];
  deck?: number[];
  extra?: number[];
};

function buildState(prefix: string, spec: { me: SideSpec; opp: SideSpec }): DuelState {
  const state = emptyDuel();
  let n = 0;
  const make = (id: number, owner: Side, options: Partial<CardInstance> = {}) => newInstance(id, owner, { uid: `${prefix}-${++n}`, ...options });
  for (const side of ['me', 'opp'] as Side[]) {
    const s = spec[side];
    const target = state[side];
    if (s.lp !== undefined) target.lp = s.lp;
    target.hand = (s.hand ?? []).map((h) => (typeof h === 'number' ? make(h, side) : make(h.id, side, { revealed: h.revealed })));
    for (const zone of ['monster', 'spell'] as SlotZone[]) {
      (s[zone as 'monster' | 'spell'] ?? []).forEach((slot, index) => {
        if (slot === null) return;
        const card = typeof slot === 'number' ? make(slot, side) : make(slot.id, side, { defense: slot.defense ?? false, faceUp: slot.faceUp ?? true, revealed: slot.revealed ?? side === 'me' });
        (target[zone as 'monster' | 'spell'] as (CardInstance | null)[])[index] = card;
      });
    }
    target.gy = (s.gy ?? []).map((id) => make(id, side));
    target.deck = (s.deck ?? []).map((id) => make(id, side));
    target.extra = (s.extra ?? []).map((id) => make(id, side));
  }
  return state;
}

const at = (side: Side, zone: ZoneType, index?: number): Location => (index === undefined ? { side, zone } : { side, zone, index });

function moveFactory(prefix: string) {
  let n = 0;
  return (action: MoveAction, cardId: number, from: Location, to: Location | null, extra: Partial<DuelMove> = {}): DuelMove => ({
    id: `${prefix}-m${++n}`,
    actor: 'me',
    action,
    cardId,
    from,
    to,
    targets: [],
    auto: false,
    note: '',
    ...extra,
  });
}

type SampleSpec = {
  id: string;
  title: string;
  task: string;
  description: string;
  explanation: string;
  goal: PuzzleGoal;
  difficulty: Difficulty;
};

function puzzle(spec: SampleSpec, initial: DuelState, solutions: { name: string; moves: DuelMove[] }[]): Puzzle {
  return {
    ...spec,
    rating: DIFFICULTY_RATING[spec.difficulty],
    initial,
    solutions: solutions.map((s, i) => ({ id: `${spec.id}-s${i + 1}`, ...s })),
    source: 'sample',
    createdAt: 0,
    updatedAt: 0,
  };
}

function raigeki(): Puzzle {
  const id = 'sample-raigeki';
  const m = moveFactory(id);
  return puzzle(
    {
      id,
      title: 'Freie Bahn',
      task: 'OTK',
      description: 'Besiege den Gegner in diesem Zug. Er hat 3000 LP und zwei Monster in Angriffsposition.',
      explanation: 'Raigeki zerstört alle Monster des Gegners. Danach greift der Weiße Drache mit eiskaltem Blick direkt für genau 3000 Schaden an.',
      goal: 'lethal',
      difficulty: 1,
    },
    buildState(id, {
      me: { monster: [null, null, C.blueEyes, null, null], hand: [C.raigeki] },
      opp: { lp: 3000, monster: [null, C.celtic, null, C.skull, null] },
    }),
    [
      {
        name: 'Raigeki',
        moves: [
          m('activate', C.raigeki, at('me', 'hand', 0), at('me', 'gy'), { faceUp: true }),
          m('destroy', C.celtic, at('opp', 'monster', 1), at('opp', 'gy'), { auto: true, note: 'Raigeki zerstört alle Monster des Gegners.' }),
          m('destroy', C.skull, at('opp', 'monster', 3), at('opp', 'gy'), { auto: true }),
          m('direct_attack', C.blueEyes, at('me', 'monster', 2), null, { lp: { me: 0, opp: -3000 } }),
        ],
      },
    ]
  );
}

function fusion(): Puzzle {
  const id = 'sample-fusion';
  const m = moveFactory(id);
  return puzzle(
    {
      id,
      title: 'Tausend Jahre',
      task: 'OTK',
      description: 'Der Gegner hat 2400 LP und ein leeres Feld. Eine Normalbeschwörung allein reicht nicht.',
      explanation: 'Polymerisation verschmilzt Zeitzauberer und Babydrache zum Tausend-Drachen (2400 ATK), der sofort direkt angreifen kann.',
      goal: 'lethal',
      difficulty: 2,
    },
    buildState(id, {
      me: { hand: [C.poly, C.timeWizard, C.babyDragon], extra: [C.thousandDragon] },
      opp: { lp: 2400 },
    }),
    [
      {
        name: 'Fusion',
        moves: [
          m('activate', C.poly, at('me', 'hand', 0), at('me', 'gy'), { faceUp: true }),
          m('fusion_summon', C.thousandDragon, at('me', 'extra', 0), at('me', 'emz', 0), {
            faceUp: true,
            defense: false,
            targets: [
              { cardId: C.timeWizard, from: at('me', 'hand', 0), to: at('me', 'gy') },
              { cardId: C.babyDragon, from: at('me', 'hand', 1), to: at('me', 'gy') },
            ],
          }),
          m('direct_attack', C.thousandDragon, at('me', 'emz', 0), null, { lp: { me: 0, opp: -2400 } }),
        ],
      },
    ]
  );
}

function mirrorForce(): Puzzle {
  const id = 'sample-mirror-force';
  const m = moveFactory(id);
  const destroyTrap = m('destroy', C.mirrorForce, at('opp', 'spell', 2), at('opp', 'gy'), { auto: true, note: 'Spiegelkraft wird zerstört, bevor du angreifst.' });
  const mst = m('activate', C.mst, at('me', 'hand', 0), at('me', 'gy'), {
    faceUp: true,
    targets: [{ cardId: C.mirrorForce, from: at('opp', 'spell', 2), to: null }],
  });
  const dm = m('direct_attack', C.darkMagician, at('me', 'monster', 1), null, { lp: { me: 0, opp: -2500 }, unordered: true });
  const celtic = m('direct_attack', C.celtic, at('me', 'monster', 3), null, { lp: { me: 0, opp: -1400 }, unordered: true });
  return puzzle(
    {
      id,
      title: 'Spiegel zerbrechen',
      task: 'OTK – Spiegelkraft umgehen',
      description: 'Der Gegner hat 3900 LP. Seine gesetzte Karte ist Spiegelkraft – greifst du an, werden alle deine Monster in Angriffsposition zerstört.',
      explanation: 'Mystischer Raum-Taifun zerstört Spiegelkraft vor dem Kampf. Danach treffen beide Angriffe (2500 + 1400 = 3900). Die Reihenfolge der Angriffe ist egal.',
      goal: 'lethal',
      difficulty: 2,
    },
    buildState(id, {
      me: { monster: [null, C.darkMagician, null, C.celtic, null], hand: [C.mst] },
      opp: { lp: 3900, spell: [null, null, { id: C.mirrorForce, faceUp: false, revealed: true }, null, null] },
    }),
    [{ name: 'Taifun, dann angreifen', moves: [mst, destroyTrap, dm, celtic] }]
  );
}

function changeOfHeart(): Puzzle {
  const id = 'sample-change-of-heart';
  const m = moveFactory(id);
  const opening = () => [
    m('activate', C.changeOfHeart, at('me', 'hand', 0), at('me', 'gy'), {
      faceUp: true,
      targets: [{ cardId: C.skull, from: at('opp', 'monster', 3), to: null }],
    }),
    m('take_control', C.skull, at('opp', 'monster', 3), at('me', 'monster', 0), { auto: true, note: 'Du übernimmst den Beschworenen Totenkopf bis zur End Phase.' }),
  ];
  return puzzle(
    {
      id,
      title: 'Sinneswandel',
      task: 'OTK',
      description: 'Der Gegner hat 2000 LP, einen Beschworenen Totenkopf und einen verdeckten Keltischen Wächter (DEF 1200).',
      explanation:
        'Mit Sinneswandel übernimmst du den Totenkopf. Ein Monster räumt den verdeckten Wächter ab, das andere greift direkt an – beide Reihenfolgen gewinnen.',
      goal: 'lethal',
      difficulty: 3,
    },
    buildState(id, {
      me: { monster: [null, null, C.blueEyes, null, null], hand: [C.changeOfHeart] },
      opp: { lp: 2000, monster: [null, { id: C.celtic, defense: true, faceUp: false, revealed: true }, null, C.skull, null] },
    }),
    [
      {
        name: 'Drache räumt ab',
        moves: [
          ...opening(),
          m('attack', C.blueEyes, at('me', 'monster', 2), null, { targets: [{ cardId: C.celtic, from: at('opp', 'monster', 1), to: at('opp', 'gy') }], lp: { me: 0, opp: 0 } }),
          m('direct_attack', C.skull, at('me', 'monster', 0), null, { lp: { me: 0, opp: -2500 } }),
        ],
      },
      {
        name: 'Totenkopf räumt ab',
        moves: [
          ...opening(),
          m('attack', C.skull, at('me', 'monster', 0), null, { targets: [{ cardId: C.celtic, from: at('opp', 'monster', 1), to: at('opp', 'gy') }], lp: { me: 0, opp: 0 } }),
          m('direct_attack', C.blueEyes, at('me', 'monster', 2), null, { lp: { me: 0, opp: -3000 } }),
        ],
      },
    ]
  );
}

function ashBlossom(): Puzzle {
  const id = 'sample-ash';
  const m = moveFactory(id);
  return puzzle(
    {
      id,
      title: 'Köder für Ash',
      task: 'OTK – Ash Blossom umgehen',
      description:
        'Der Gegner hat 3000 LP und Ash Blossom auf der Hand. Er setzt sie gegen die erste Karte ein, die sie treffen kann. In deinem Deck: Weißer Drache mit eiskaltem Blick und Keltischer Wächter.',
      explanation:
        'Verstärkung der Armee lockt Ash Blossom heraus. Danach schickt Törichtes Begräbnis den Drachen auf den Friedhof, Monster Reborn holt ihn zurück und er greift für 3000 an.',
      goal: 'lethal',
      difficulty: 4,
    },
    buildState(id, {
      me: { hand: [C.reinforcement, C.foolish, C.reborn], deck: [C.blueEyes, C.celtic] },
      opp: { lp: 3000, hand: [{ id: C.ash, revealed: true }] },
    }),
    [
      {
        name: 'Köder zuerst',
        moves: [
          m('activate', C.reinforcement, at('me', 'hand', 0), at('me', 'gy'), { faceUp: true }),
          m('activate', C.ash, at('opp', 'hand', 0), at('opp', 'gy'), {
            actor: 'opp',
            auto: true,
            faceUp: true,
            note: 'Der Gegner wirft Ash Blossom ab und annulliert Verstärkung der Armee.',
          }),
          m('activate', C.foolish, at('me', 'hand', 0), at('me', 'gy'), { faceUp: true }),
          m('send_gy', C.blueEyes, at('me', 'deck', 0), at('me', 'gy'), { note: 'Törichtes Begräbnis: Drache aus dem Deck auf den Friedhof.' }),
          m('activate', C.reborn, at('me', 'hand', 0), at('me', 'gy'), { faceUp: true }),
          m('special_summon', C.blueEyes, at('me', 'gy', 1), at('me', 'monster', 0), { faceUp: true, defense: false }),
          m('direct_attack', C.blueEyes, at('me', 'monster', 0), null, { lp: { me: 0, opp: -3000 } }),
        ],
      },
    ]
  );
}

export function samplePuzzles(): Puzzle[] {
  return [raigeki(), fusion(), mirrorForce(), changeOfHeart(), ashBlossom()];
}

export const SAMPLE_CARD_IDS: number[] = Object.values(C);
