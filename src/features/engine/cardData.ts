import type { EngineCard } from './types';

/**
 * Columns read from EDOPro's cards.cdb. The 64-bit setcode is split in SQL
 * (four 16-bit archetype codes), because JavaScript numbers would lose
 * precision. Level packs the Pendulum Scales into its upper bytes, and Link
 * Monsters store their markers in the DEF column.
 */
export const CDB_QUERY = `
  SELECT d.id AS code, d.alias, d.type, d.atk, d.def, d.level & 255 AS level, (d.level >> 24) & 255 AS lscale,
    (d.level >> 16) & 255 AS rscale, d.race, d.attribute,
    d.setcode & 65535 AS s0, (d.setcode >> 16) & 65535 AS s1, (d.setcode >> 32) & 65535 AS s2, (d.setcode >> 48) & 65535 AS s3,
    t.name, t.str1, t.str2, t.str3, t.str4, t.str5, t.str6, t.str7, t.str8, t.str9, t.str10, t.str11, t.str12, t.str13, t.str14, t.str15, t.str16
  FROM datas d JOIN texts t ON t.id = d.id`;

export type CdbRow = {
  code: number;
  alias: number;
  type: number;
  atk: number;
  def: number;
  level: number;
  lscale: number;
  rscale: number;
  race: number;
  attribute: number;
  s0: number;
  s1: number;
  s2: number;
  s3: number;
  name: string;
} & Record<`str${number}`, string | null>;

const LINK = 0x4000000;

export function cdbRowToCard(row: CdbRow): EngineCard {
  const isLink = (row.type & LINK) !== 0;
  return {
    code: row.code,
    alias: row.alias,
    setcodes: [row.s0, row.s1, row.s2, row.s3].filter((s) => s !== 0),
    type: row.type,
    level: row.level,
    attribute: row.attribute,
    race: row.race,
    attack: row.atk,
    defense: isLink ? 0 : row.def,
    lscale: row.lscale,
    rscale: row.rscale,
    linkMarker: isLink ? row.def : 0,
  };
}

/** The 16 effect strings of a card ("Negate that effect", …). */
export function cdbRowStrings(row: CdbRow): string[] {
  const strings: string[] = [];
  for (let i = 1; i <= 16; i++) strings.push(row[`str${i}`] ?? '');
  while (strings.length > 0 && !strings[strings.length - 1]) strings.pop();
  return strings;
}

/** Compact form for storage and transfer: one array per card. */
export type PackedCard = [number, number, number[], number, number, number, number, number, number, number, number, number];

export function packCard(c: EngineCard): PackedCard {
  return [c.code, c.alias, c.setcodes, c.type, c.level, c.attribute, c.race, c.attack, c.defense, c.lscale, c.rscale, c.linkMarker];
}

export function unpackCard(p: PackedCard): EngineCard {
  const [code, alias, setcodes, type, level, attribute, race, attack, defense, lscale, rscale, linkMarker] = p;
  return { code, alias, setcodes, type, level, attribute, race, attack, defense, lscale, rscale, linkMarker };
}

/** System strings from EDOPro's strings.conf ("!system 500 Select the card(s) to Tribute"). */
export function parseStringsConf(text: string): Map<number, string> {
  const map = new Map<number, string>();
  for (const line of text.split('\n')) {
    const match = /^!system (\d+) (.*)$/.exec(line.trim());
    if (match) map.set(Number(match[1]), match[2]);
  }
  return map;
}
