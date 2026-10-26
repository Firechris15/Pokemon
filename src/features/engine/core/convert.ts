import type { OcgCardData, OcgResponse } from 'ocgcore-wasm';

import type { EngineCard, EngineMessage, EngineResponse } from '../types';

/** Deep copy with bigints turned into numbers (all engine values fit into a double). */
export function toPlain<T>(value: T): T {
  if (typeof value === 'bigint') return Number(value) as T;
  if (Array.isArray(value)) return value.map(toPlain) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) out[key] = toPlain(v);
    return out as T;
  }
  return value;
}

export function toEngineMessage(message: unknown): EngineMessage {
  return toPlain(message) as EngineMessage;
}

export function toOcgResponse(response: EngineResponse): OcgResponse {
  if (response.type === 16) return { ...response, races: response.races.map((r) => BigInt(r)) } as unknown as OcgResponse;
  return response as unknown as OcgResponse;
}

export function toOcgCard(card: EngineCard): OcgCardData {
  return {
    code: card.code,
    alias: card.alias,
    setcodes: card.setcodes,
    type: card.type,
    level: card.level,
    attribute: card.attribute,
    race: BigInt(card.race),
    attack: card.attack,
    defense: card.defense,
    lscale: card.lscale,
    rscale: card.rscale,
    link_marker: card.linkMarker,
  };
}
