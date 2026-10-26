import { base64ToBytes, bytesToBase64 } from '@/lib/base64';

import type { DeckCards } from './types';

/**
 * Deck list formats:
 * - YDK (EDOPro / YGOPRODeck / Dueling Book export): "#main", "#extra",
 *   "!side" headers followed by one passcode per line.
 * - ydke:// links: three base64 blocks of little-endian uint32 passcodes.
 * - Plain lists: passcodes or card names, optionally with a count
 *   ("3 Ash Blossom & Joyous Spring", "3x 14558127").
 */

export type ParsedLine = {
  section: keyof DeckCards | null;
  count: number;
  passcode: number | null;
  name: string | null;
  /** The original line, used as a fallback name (e.g. for "7 Colored Fish"). */
  raw: string;
  line: number;
};

export type ParsedDeckList = {
  format: 'ydk' | 'ydke' | 'list';
  /** True if the input declared its sections, so they should be kept as they are. */
  hasSections: boolean;
  entries: ParsedLine[];
  /** Name from a "#name" / "!name" line if present. */
  name: string | null;
};

const SECTION_HEADERS: Record<string, keyof DeckCards> = {
  '#main': 'main',
  '#extra': 'extra',
  '!side': 'side',
  '#side': 'side',
};

export function parseDeckList(input: string): ParsedDeckList {
  const trimmed = input.trim();
  const ydkeMatch = trimmed.match(/ydke:\/\/[A-Za-z0-9+/=!]*/);
  if (ydkeMatch) return parseYdke(ydkeMatch[0]);

  const entries: ParsedLine[] = [];
  let section: keyof DeckCards | null = null;
  let hasSections = false;
  let name: string | null = null;
  const lines = input.split(/\r?\n/);

  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    const lower = line.toLowerCase();
    const header = SECTION_HEADERS[lower.split(/\s+/)[0]];
    if (header) {
      section = header;
      hasSections = true;
      return;
    }
    // Section headers used by text decklists ("Main Deck:", "Extra Deck (15)").
    const textHeader = lower.match(/^(main|extra|side)(\s*deck)?\s*(\(\d+\))?\s*:?\s*$/);
    if (textHeader) {
      section = textHeader[1] as keyof DeckCards;
      hasSections = true;
      return;
    }
    const nameMatch = line.match(/^[#!]name\s+(.+)$/i);
    if (nameMatch) {
      name = nameMatch[1].trim();
      return;
    }
    if (line.startsWith('#') || line.startsWith('!') || line.startsWith('//')) return;

    const entry = parseEntry(line);
    if (entry) entries.push({ ...entry, section, line: index + 1 });
  });

  const format = hasSections && entries.every((e) => e.passcode !== null) ? 'ydk' : 'list';
  return { format, hasSections, entries, name };
}

function parseEntry(line: string): Omit<ParsedLine, 'section' | 'line'> | null {
  // "3x 14558127", "3 14558127"
  const countPasscode = line.match(/^(\d{1,2})\s*x?\s+(\d{3,10})\s*$/i);
  if (countPasscode) {
    return { count: Number(countPasscode[1]), passcode: Number(countPasscode[2]), name: null, raw: line };
  }
  // "14558127", "14558127 -- comment"
  const passcodeOnly = line.match(/^(\d{1,10})\s*(?:(?:--|#|\/\/).*)?$/);
  if (passcodeOnly) return { count: 1, passcode: Number(passcodeOnly[1]), name: null, raw: line };
  // "3x Ash Blossom & Joyous Spring", "Ash Blossom & Joyous Spring x3"
  const countName = line.match(/^(\d{1,2})\s*x?\s+(.+)$/i);
  if (countName) return { count: Number(countName[1]), passcode: null, name: cleanName(countName[2]), raw: line };
  const nameCount = line.match(/^(.+?)\s+x\s?(\d{1,2})$/i);
  if (nameCount) return { count: Number(nameCount[2]), passcode: null, name: cleanName(nameCount[1]), raw: line };
  return { count: 1, passcode: null, name: cleanName(line), raw: line };
}

function cleanName(name: string): string {
  return name.replace(/^[-*•]\s*/, '').trim();
}

export function parseYdke(url: string): ParsedDeckList {
  const body = url.replace(/^ydke:\/\//, '');
  const parts = body.split('!');
  const sections: (keyof DeckCards)[] = ['main', 'extra', 'side'];
  const entries: ParsedLine[] = [];
  sections.forEach((section, index) => {
    for (const passcode of decodePasscodes(parts[index] ?? '')) {
      entries.push({ section, count: 1, passcode, name: null, raw: String(passcode), line: index + 1 });
    }
  });
  return { format: 'ydke', hasSections: true, entries, name: null };
}

function decodePasscodes(block: string): number[] {
  if (!block) return [];
  const bytes = base64ToBytes(block);
  const passcodes: number[] = [];
  for (let i = 0; i + 3 < bytes.length; i += 4) {
    passcodes.push((bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24)) >>> 0);
  }
  return passcodes;
}

function encodePasscodes(passcodes: number[]): string {
  const bytes = new Uint8Array(passcodes.length * 4);
  passcodes.forEach((code, i) => {
    bytes[i * 4] = code & 0xff;
    bytes[i * 4 + 1] = (code >>> 8) & 0xff;
    bytes[i * 4 + 2] = (code >>> 16) & 0xff;
    bytes[i * 4 + 3] = (code >>> 24) & 0xff;
  });
  return bytesToBase64(bytes);
}

export function toYdke(deck: DeckCards): string {
  return `ydke://${encodePasscodes(deck.main)}!${encodePasscodes(deck.extra)}!${encodePasscodes(deck.side)}!`;
}

export function toYdk(deck: DeckCards, author = 'YGO Trainer'): string {
  return [`#created by ${author}`, '#main', ...deck.main.map(String), '#extra', ...deck.extra.map(String), '!side', ...deck.side.map(String), ''].join(
    '\n'
  );
}

/** File name safe for iOS Files / browsers. */
export function ydkFileName(deckName: string): string {
  const base = deckName.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'deck';
  return `${base}.ydk`;
}
