// Engine environment from the test fixtures (test/fixtures/engine), built by
// scripts/engine-fixtures.mjs from EDOPro's card database and scripts.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import createCore, { cardMatchesOpcode, OcgDuelMode, type OcgCardData } from 'ocgcore-wasm';

import { CDB_QUERY, cdbRowStrings, cdbRowToCard, type CdbRow } from '@/features/engine/cardData';
import { toOcgCard } from '@/features/engine/core/convert';
import type { EngineEnv } from '@/features/engine/core/session';
import type { EngineCard } from '@/features/engine/types';
import type { EngineRuntime } from '@/features/engine/worker/controller';
import { heapOf } from '@/features/engine/worker/heap';

export const FIXTURES = path.resolve('test/fixtures/engine');

export function fixtureCards(): { cards: EngineCard[]; strings: Map<number, string[]> } {
  const db = new DatabaseSync(path.join(FIXTURES, 'cards.cdb'));
  const rows = db.prepare(CDB_QUERY).all() as unknown as CdbRow[];
  db.close();
  return { cards: rows.map(cdbRowToCard), strings: new Map(rows.map((r) => [r.code, cdbRowStrings(r)])) };
}

/** All fixture scripts; cards without a script file (Normal Monsters) map to ''. */
export function fixtureScripts(cards: EngineCard[]): Map<string, string> {
  const dir = path.join(FIXTURES, 'scripts');
  const scripts = new Map(fs.readdirSync(dir).map((name) => [name, fs.readFileSync(path.join(dir, name), 'utf8')]));
  for (const card of cards) if (!scripts.has(`c${card.code}.lua`)) scripts.set(`c${card.code}.lua`, '');
  return scripts;
}

let runtime: Promise<EngineRuntime> | null = null;

export function loadRuntime(): Promise<EngineRuntime> {
  runtime ??= createCore({ sync: true }).then((lib) => ({
    lib,
    flags: { mr5: OcgDuelMode.MODE_MR5, attackFirstTurn: OcgDuelMode.ATTACK_FIRST_TURN },
    matchesOpcode: (card: OcgCardData, opcodes: bigint[]) => cardMatchesOpcode(card, opcodes as never),
    now: () => Date.now(),
    heap: heapOf(lib),
  }));
  return runtime;
}

export async function loadEnv(): Promise<EngineEnv> {
  const rt = await loadRuntime();
  const { cards } = fixtureCards();
  return { lib: rt.lib, flags: rt.flags, heap: rt.heap, cards: new Map(cards.map((c) => [c.code, toOcgCard(c)])), scripts: fixtureScripts(cards) };
}
