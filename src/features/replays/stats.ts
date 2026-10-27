import type { Player, ReplayData } from '@/features/engine/types';

import type { ReplaySummary } from './repository';

/** What one player did in a duel. */
export type SideStats = {
  summons: number;
  specialSummons: number;
  sets: number;
  activations: number;
  /** Own chain links that were negated. */
  negated: number;
  attacks: number;
  /** Damage this player inflicted on the other one. */
  damageDealt: number;
  lpPaid: number;
  recovered: number;
  drawn: number;
};

export type MatchStats = {
  firstPlayer: 'me' | 'opp' | null;
  turns: number;
  /** LP after each turn; entry 0 is the start of the duel. */
  lpByTurn: { turn: number; me: number; opp: number }[];
  me: SideStats;
  opp: SideStats;
  /** Your most activated cards. */
  topCards: { code: number; count: number }[];
  /** Biggest single damage of the duel. */
  biggestHit: { turn: number; amount: number; toMe: boolean } | null;
};

const emptySide = (): SideStats => ({ summons: 0, specialSummons: 0, sets: 0, activations: 0, negated: 0, attacks: 0, damageDealt: 0, lpPaid: 0, recovered: 0, drawn: 0 });

/**
 * Key figures of one duel from its action log. LP are tracked from damage,
 * costs and recoveries; `startLp` overrides the configured starting LP
 * (puzzles set their own LP in the puzzle script).
 */
export function matchStats(data: ReplayData, viewer: Player, startLp?: [number, number]): MatchStats {
  const sides: [SideStats, SideStats] = [emptySide(), emptySide()];
  const lp: [number, number] = startLp ? [...startLp] : [data.config.players[0].lp, data.config.players[1].lp];
  const rel = (p: Player) => (p === viewer ? 'me' : 'opp');
  const lpByTurn: MatchStats['lpByTurn'] = [{ turn: 0, me: lp[viewer], opp: lp[1 - viewer] }];
  const activated = new Map<number, number>();
  const chain: Player[] = [];
  let turn = 0;
  let firstPlayer: MatchStats['firstPlayer'] = null;
  let biggestHit: MatchStats['biggestHit'] = null;
  const closeTurn = () => {
    if (turn > 0) lpByTurn.push({ turn, me: lp[viewer], opp: lp[1 - viewer] });
  };

  for (const e of data.log) {
    switch (e.k) {
      case 'turn':
        closeTurn();
        turn = e.turn;
        if (e.turn === 1) firstPlayer = rel(e.player);
        break;
      case 'draw':
        sides[e.player].drawn += e.codes.length;
        break;
      case 'summon':
        sides[e.player].summons++;
        break;
      case 'spsummon':
        sides[e.player].specialSummons++;
        break;
      case 'set':
        sides[e.player].sets++;
        break;
      case 'activate':
        sides[e.player].activations++;
        chain[e.chain - 1] = e.player;
        if (e.player === viewer && e.code) activated.set(e.code, (activated.get(e.code) ?? 0) + 1);
        break;
      case 'negated': {
        const owner = chain[e.chain - 1];
        if (owner !== undefined) sides[owner].negated++;
        break;
      }
      case 'resolved':
        if (e.chain <= 1) chain.length = 0;
        break;
      case 'attack':
        sides[e.player].attacks++;
        break;
      case 'damage':
        lp[e.player] -= e.amount;
        sides[1 - e.player].damageDealt += e.amount;
        if (!biggestHit || e.amount > biggestHit.amount) biggestHit = { turn, amount: e.amount, toMe: e.player === viewer };
        break;
      case 'cost':
        lp[e.player] -= e.amount;
        sides[e.player].lpPaid += e.amount;
        break;
      case 'recover':
        lp[e.player] += e.amount;
        sides[e.player].recovered += e.amount;
        break;
      case 'lp':
        lp[e.player] = e.lp;
        break;
    }
  }
  closeTurn();

  return {
    firstPlayer,
    turns: turn,
    lpByTurn: lpByTurn.map((p) => ({ ...p, me: Math.max(0, p.me), opp: Math.max(0, p.opp) })),
    me: sides[viewer],
    opp: sides[1 - viewer],
    topCards: [...activated.entries()]
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .slice(0, 5)
      .map(([code, count]) => ({ code, count })),
    biggestHit,
  };
}

export type Outcome = 'W' | 'L' | 'D';

export function outcomeOf(summary: Pick<ReplaySummary, 'winner' | 'viewer'>): Outcome {
  return summary.winner === null ? 'D' : summary.winner === summary.viewer ? 'W' : 'L';
}

export type Group = { key: string; label: string; games: number; wins: number; losses: number; draws: number };

export type OverallStats = {
  games: number;
  wins: number;
  losses: number;
  draws: number;
  byDeck: Group[];
  byOpponent: Group[];
  byLevel: Group[];
  byStart: Group[];
  /** How duels ended (win reasons), most frequent first. */
  reasons: { reason: string; wins: number; losses: number }[];
  avgTurns: number;
  avgDamageDealt: number;
  avgDamageTaken: number;
  /** Results oldest → newest (last 20). */
  recent: Outcome[];
  streak: { outcome: Outcome; count: number } | null;
};

export type StatsInput = ReplaySummary & { stats: MatchStats | null };

/** Win rate etc. over all AI duels (puzzles are not counted). */
export function overallStats(replays: StatsInput[]): OverallStats {
  const duels = replays.filter((r) => r.mode === 'ai').sort((a, b) => a.createdAt - b.createdAt);
  const outcomes = duels.map(outcomeOf);
  const groups = (keyOf: (r: StatsInput) => { key: string; label: string } | null): Group[] => {
    const map = new Map<string, Group>();
    duels.forEach((r, i) => {
      const k = keyOf(r);
      if (!k) return;
      const g = map.get(k.key) ?? { ...k, games: 0, wins: 0, losses: 0, draws: 0 };
      g.games++;
      if (outcomes[i] === 'W') g.wins++;
      else if (outcomes[i] === 'L') g.losses++;
      else g.draws++;
      map.set(k.key, g);
    });
    return [...map.values()].sort((a, b) => b.games - a.games || a.label.localeCompare(b.label));
  };
  const reasons = new Map<string, { reason: string; wins: number; losses: number }>();
  duels.forEach((r, i) => {
    if (outcomes[i] === 'D') return;
    const entry = reasons.get(r.reason) ?? { reason: r.reason, wins: 0, losses: 0 };
    if (outcomes[i] === 'W') entry.wins++;
    else entry.losses++;
    reasons.set(r.reason, entry);
  });
  const withStats = duels.filter((r) => r.stats);
  const avg = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
  let streak: OverallStats['streak'] = null;
  for (let i = outcomes.length - 1; i >= 0; i--) {
    if (!streak) streak = { outcome: outcomes[i], count: 1 };
    else if (outcomes[i] === streak.outcome) streak.count++;
    else break;
  }
  return {
    games: duels.length,
    wins: outcomes.filter((o) => o === 'W').length,
    losses: outcomes.filter((o) => o === 'L').length,
    draws: outcomes.filter((o) => o === 'D').length,
    byDeck: groups((r) => ({ key: r.myDeck, label: r.myDeck })),
    byOpponent: groups((r) => ({ key: r.oppDeck, label: r.oppDeck })),
    byLevel: groups((r) => (r.aiLevel ? { key: String(r.aiLevel), label: `KI Stufe ${r.aiLevel}` } : null)),
    byStart: groups((r) => (r.stats?.firstPlayer ? { key: r.stats.firstPlayer, label: r.stats.firstPlayer === 'me' ? 'Du beginnst' : 'KI beginnt' } : null)),
    reasons: [...reasons.values()].sort((a, b) => b.wins + b.losses - (a.wins + a.losses)),
    avgTurns: avg(duels.map((r) => r.turns)),
    avgDamageDealt: avg(withStats.map((r) => r.stats!.me.damageDealt)),
    avgDamageTaken: avg(withStats.map((r) => r.stats!.opp.damageDealt)),
    recent: outcomes.slice(-20),
    streak,
  };
}

/** Win rate 0…1 (draws count as half), null without games. */
export function winRate(g: { games: number; wins: number; draws: number }): number | null {
  return g.games ? (g.wins + g.draws / 2) / g.games : null;
}
