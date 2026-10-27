import { PHASE_NAMES, type TextSources } from '@/features/engine/actions';
import { logText } from '@/features/engine/logText';
import { Msg, Pos } from '@/features/engine/ocg';
import type { BoardSide, BoardSummary, DecisionPoint, ReplayInfo } from '@/features/engine/types';
import type { Replay } from '@/features/replays/repository';

import { decisionOptions, sameResponse, type DecisionOption } from './options';
import type { AnalysedSuggestion } from './types';

export type Names = { nameOf: (code: number) => string; sources: TextSources };

/** A decision as shown to Claude: number E1, E2, … with all legal options. */
export type PreparedDecision = { number: number; point: DecisionPoint; options: DecisionOption[]; chosen: number };

const MAX_DECISIONS = 120;

export const SYSTEM_PROMPT = `Du bist ein erfahrener Yu-Gi-Oh!-Trainer (TCG, Master Rule 5). Du analysierst ein Duell, das ein Spieler in einer Trainings-App gegen eine Computer-KI gespielt hat, und hilfst ihm, besser zu werden.

Du bekommst den Spielverlauf aus Sicht des Spielers (verdeckte Karten des Gegners kennt er nicht, außer sie wurden aufgedeckt) und seine Entscheidungen E1, E2, … jeweils mit Spielfeld, allen Optionen, die die Regel-Engine (EDOPro) erlaubt hat, und der gewählten Option.

Schlage bessere Züge nur als eine dieser Optionen vor: "decision" ist die Nummer der Entscheidung (bei E7 also 7), "option" die Nummer der Option. Die App spielt jeden Vorschlag in der Regel-Engine nach und zeigt dem Spieler, wie der Zug damit ausgegangen wäre. Schlage keine Option vor, die der Spieler ohnehin gewählt hat.

Beurteile Entscheidungen nur mit den Informationen, die der Spieler zu diesem Zeitpunkt hatte. Erfinde keine Kartentexte; wenn du dir bei einer Regel oder einem Ruling nicht sicher bist, sag das ausdrücklich.

Antworte auf Deutsch, knapp und konkret:
- summary: Gesamteinschätzung in 3 bis 6 Sätzen (warum das Duell so ausging, was gut lief).
- turning_points: die wichtigsten Wendepunkte mit Zugnummer.
- suggestions: bis zu 5 Entscheidungen, bei denen eine andere Option deutlich besser gewesen wäre, jeweils mit Begründung.
- tips: 2 bis 4 Tipps für die nächsten Duelle mit diesem Deck.`;

const position = (p: number) => `${p & Pos.FACEDOWN ? 'verdeckt, ' : ''}${p & Pos.DEFENSE ? 'Verteidigung' : 'Angriff'}`;

function sideText(side: BoardSide, own: boolean, { nameOf }: Names): string[] {
  const card = (code: number, hidden: string) => (code ? nameOf(code) : hidden);
  const monsters = side.monsters.map(
    (m) => `${card(m.code, 'verdecktes Monster')} [${position(m.position)}${m.attack !== null ? `, ATK ${m.attack}/DEF ${m.defense ?? '?'}` : ''}${m.materials ? `, ${m.materials} Material` : ''}]`
  );
  const spells = side.spells.map((s) => `${card(s.code, 'verdeckte Karte')}${s.code && !s.faceUp ? ' (gesetzt)' : ''}`);
  const list = (codes: number[]) => (codes.length ? codes.map((c) => card(c, '?')).join(', ') : '–');
  return [
    own ? `Deine Hand: ${list(side.hand)}` : `Hand des Gegners: ${side.hand.length} Karte(n)${side.hand.some(Boolean) ? ` (bekannt: ${side.hand.filter(Boolean).map(nameOf).join(', ')})` : ''}`,
    `${own ? 'Deine' : 'Gegnerische'} Monster: ${monsters.join('; ') || '–'}`,
    `${own ? 'Deine' : 'Gegnerische'} Zauber/Fallen: ${spells.join('; ') || '–'}`,
    `${own ? 'Dein' : 'Gegnerischer'} Friedhof: ${list(side.grave)} · Verbannt: ${list(side.banished)} · Deck: ${side.deck} · Extra Deck: ${side.extra}`,
  ];
}

export function boardText(board: BoardSummary, names: Names): string[] {
  return [
    `LP: du ${board.me.lp} · Gegner ${board.opp.lp}`,
    ...sideText(board.me, true, names),
    ...sideText(board.opp, false, names),
    ...(board.chain.length ? [`Aktuelle Kette: ${board.chain.map((l, i) => `${i + 1}. ${l.mine ? 'du' : 'Gegner'}: ${names.nameOf(l.code)}`).join(' → ')}`] : []),
  ];
}

/** The viewer's decisions with at least two options, numbered E1, E2, … */
export function prepareDecisions(info: ReplayInfo, names: Names): PreparedDecision[] {
  let points = info.decisions;
  if (points.length > MAX_DECISIONS) {
    const main = points.filter((d) => d.request.type === Msg.SELECT_IDLECMD || d.request.type === Msg.SELECT_BATTLECMD || d.request.type === Msg.SELECT_CHAIN);
    points = main.length > MAX_DECISIONS ? main.slice(0, MAX_DECISIONS) : main;
  }
  const out: PreparedDecision[] = [];
  for (const point of points) {
    const options = decisionOptions(point.request, names);
    if (options.length < 2) continue;
    out.push({ number: out.length + 1, point, options, chosen: options.findIndex((o) => sameResponse(o.response, point.response)) });
  }
  return out;
}

function deckList(codes: number[], nameOf: (code: number) => string): string {
  const counts = new Map<number, number>();
  for (const code of codes) counts.set(code, (counts.get(code) ?? 0) + 1);
  return [...counts.entries()].map(([code, n]) => `${n}× ${nameOf(code)}`).join(', ');
}

/** The user message for Claude: duel facts, the viewer's deck, the duel log and every decision. */
export function buildPrompt(replay: Replay, info: ReplayInfo, decisions: PreparedDecision[], names: Names): string {
  const viewer = replay.viewer;
  const { nameOf, sources } = names;
  const result = replay.winner === null ? 'Unentschieden' : replay.winner === viewer ? 'Gewonnen' : 'Verloren';
  const first = replay.data.log.find((e) => e.k === 'turn');
  const lines: string[] = [
    '# Duell',
    `Modus: ${replay.mode === 'puzzle' ? `Puzzle („${replay.title}“)` : `Duell gegen die KI${replay.aiLevel ? ` (Stufe ${replay.aiLevel})` : ''}`}`,
    `Dein Deck: ${replay.myDeck} · Deck des Gegners: ${replay.oppDeck}`,
    `Ergebnis: ${result} (${replay.reason}) nach ${replay.turns} Zügen${first && first.k === 'turn' ? ` · ${first.player === viewer ? 'Du hast begonnen' : 'Der Gegner hat begonnen'}` : ''}`,
  ];
  const me = replay.data.config.players[viewer];
  if (me.main.length) {
    lines.push('', '# Dein Deck', `Main Deck (${me.main.length}): ${deckList(me.main, nameOf)}`);
    if (me.extra.length) lines.push(`Extra Deck (${me.extra.length}): ${deckList(me.extra, nameOf)}`);
  }

  // Duel log with markers where the decisions were taken.
  const markers = new Map<number, number[]>();
  for (const d of decisions) {
    const at = info.frames[d.point.frame]?.logEnd ?? 0;
    markers.set(at, [...(markers.get(at) ?? []), d.number]);
  }
  lines.push('', '# Spielverlauf');
  replay.data.log.forEach((entry, i) => {
    for (const n of markers.get(i) ?? []) lines.push(`[E${n}] deine Entscheidung`);
    const text = logText(entry, viewer, nameOf, sources);
    if (text) lines.push(text);
  });
  for (const n of markers.get(replay.data.log.length) ?? []) lines.push(`[E${n}] deine Entscheidung`);
  if (info.diverged !== null) lines.push('(Ab hier passt das Replay nicht mehr zu den aktuellen Kartenskripten; die Entscheidungen danach fehlen.)');

  lines.push('', '# Deine Entscheidungen');
  for (const d of decisions) {
    const b = d.point.board;
    lines.push('', `## E${d.number} · Zug ${b.turn} (${b.myTurn ? 'dein Zug' : 'Zug des Gegners'}) · ${PHASE_NAMES[b.phase] ?? ''}`);
    lines.push(...boardText(b, names));
    lines.push('Optionen:');
    d.options.forEach((o, i) => lines.push(`${i + 1}. ${o.label}`));
    lines.push(`Gewählt: ${d.chosen >= 0 ? d.chosen + 1 : 'unbekannt'}`);
  }
  return lines.join('\n');
}

export type RawSuggestion = { decision: number; option: number; reason: string };

/** Maps Claude's references (E-number, option number) to engine responses; unknown references are counted, not shown. */
export function mapSuggestions(raw: RawSuggestion[], decisions: PreparedDecision[]): { suggestions: AnalysedSuggestion[]; invalid: number } {
  const suggestions: AnalysedSuggestion[] = [];
  let invalid = 0;
  for (const s of raw) {
    const d = decisions.find((x) => x.number === Math.round(s.decision));
    const index = Math.round(s.option) - 1;
    const option = d?.options[index];
    if (!d || !option || index === d.chosen) {
      invalid++;
      continue;
    }
    suggestions.push({
      decision: d.number,
      responseIndex: d.point.index,
      frame: d.point.frame,
      turn: d.point.board.turn,
      chosenLabel: d.chosen >= 0 ? d.options[d.chosen].label : 'unbekannt',
      optionLabel: option.label,
      response: option.response,
      reason: s.reason,
      check: null,
    });
  }
  return { suggestions, invalid };
}
