import { describe, LOCATION_NAMES, PHASE_NAMES, type TextSources } from './actions';
import { Loc } from './ocg';
import type { LogEntry, Player } from './types';

/** One line of the duel log in German, from the viewer's point of view (null = not shown). */
export function logText(entry: LogEntry, viewer: Player, nameOf: (code: number) => string, sources: TextSources): string | null {
  const who = (p: Player) => (p === viewer ? 'Du' : 'Gegner');
  const card = (code: number) => (code ? nameOf(code) : 'eine verdeckte Karte');
  switch (entry.k) {
    case 'turn':
      return `— Zug ${entry.turn}: ${entry.player === viewer ? 'dein Zug' : 'Zug des Gegners'} —`;
    case 'phase':
      return entry.phase === 8 ? PHASE_NAMES[entry.phase] : null;
    case 'draw':
      return entry.player === viewer ? `Du ziehst: ${entry.codes.map(card).join(', ')}` : `Gegner zieht ${entry.codes.length} Karte${entry.codes.length === 1 ? '' : 'n'}`;
    case 'summon':
      return `${who(entry.player)}: Normalbeschwörung von ${card(entry.code)}`;
    case 'spsummon':
      return `${who(entry.player)}: Spezialbeschwörung von ${card(entry.code)}`;
    case 'flipsummon':
      return `${who(entry.player)}: Flippbeschwörung von ${card(entry.code)}`;
    case 'set':
      return entry.player === viewer ? `Du setzt ${card(entry.code)}` : `Gegner setzt eine Karte`;
    case 'activate': {
      const effect = describe(entry.description, sources);
      const from = entry.location === Loc.HAND ? ' (Hand)' : entry.location === Loc.GRAVE ? ' (Friedhof)' : '';
      return `Kette ${entry.chain}: ${who(entry.player)} aktiviert ${card(entry.code)}${from}${effect ? ` – ${effect}` : ''}`;
    }
    case 'negated':
      return `Kettenglied ${entry.chain} wurde annulliert`;
    case 'resolved':
      return null;
    case 'attack':
      return `${who(entry.player)}: ${card(entry.code)} greift ${entry.target ? card(entry.target) : 'direkt'} an`;
    case 'damage':
      return `${entry.player === viewer ? 'Du erhältst' : 'Gegner erhält'} ${entry.amount} Schaden`;
    case 'recover':
      return `${who(entry.player)}: +${entry.amount} LP`;
    case 'cost':
      return `${who(entry.player)} zahlt ${entry.amount} LP`;
    case 'lp':
      return null;
    case 'move': {
      if (entry.secret && entry.player !== viewer) return null;
      const target = LOCATION_NAMES[entry.to] ?? '';
      if (entry.to === Loc.DECK || entry.from === Loc.DECK) {
        if (entry.to === Loc.HAND && entry.player === viewer) return `${card(entry.code)} kommt aus dem Deck auf deine Hand`;
        if (entry.to === Loc.HAND) return `Gegner nimmt eine Karte aus dem Deck auf die Hand`;
      }
      if (entry.from === Loc.MZONE || entry.from === Loc.SZONE || entry.to === Loc.GRAVE || entry.to === Loc.REMOVED) {
        const owner = entry.toPlayer === viewer ? 'dein' : 'Gegner';
        if (entry.to === Loc.GRAVE) return `${card(entry.code)} → ${owner === 'dein' ? 'dein Friedhof' : 'Friedhof des Gegners'}`;
        if (entry.to === Loc.REMOVED) return `${card(entry.code)} wird verbannt`;
        if (entry.to === Loc.HAND) return `${card(entry.code)} kehrt auf die Hand zurück`;
        if (target) return `${card(entry.code)} → ${target}`;
      }
      return null;
    }
    case 'coin':
      return `${who(entry.player)} wirft eine Münze: ${entry.results.map((r) => (r ? 'Kopf' : 'Zahl')).join(', ')}`;
    case 'dice':
      return `${who(entry.player)} würfelt: ${entry.results.join(', ')}`;
    case 'win':
      return entry.player === viewer ? 'Du hast gewonnen!' : 'Du hast verloren.';
  }
}
