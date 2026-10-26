import { parseDeckList, parseYdke, toYdk, toYdke, ydkFileName } from '@/features/decks/ydk';

describe('parseDeckList – YDK', () => {
  const ydk = `#created by YGOPRODeck
#main
14558127
14558127
9674034 -- comment
#extra
86066372
!side
23434538
`;

  it('reads sections and ignores comments', () => {
    const parsed = parseDeckList(ydk);
    expect(parsed.format).toBe('ydk');
    expect(parsed.hasSections).toBe(true);
    const bySection = (s: string) => parsed.entries.filter((e) => e.section === s).map((e) => e.passcode);
    expect(bySection('main')).toEqual([14558127, 14558127, 9674034]);
    expect(bySection('extra')).toEqual([86066372]);
    expect(bySection('side')).toEqual([23434538]);
  });

  it('handles Windows line endings', () => {
    const parsed = parseDeckList(ydk.replace(/\n/g, '\r\n'));
    expect(parsed.entries).toHaveLength(5);
  });

  it('round-trips through toYdk', () => {
    const deck = { main: [1, 2, 2], extra: [3], side: [] };
    const parsed = parseDeckList(toYdk(deck));
    expect(parsed.entries.map((e) => [e.section, e.passcode])).toEqual([
      ['main', 1],
      ['main', 2],
      ['main', 2],
      ['extra', 3],
    ]);
  });
});

describe('parseDeckList – plain lists', () => {
  it('reads passcodes without headers', () => {
    const parsed = parseDeckList('14558127\n86066372\n');
    expect(parsed.hasSections).toBe(false);
    expect(parsed.entries.map((e) => e.passcode)).toEqual([14558127, 86066372]);
  });

  it('reads counts and names', () => {
    const parsed = parseDeckList('3 Ash Blossom & Joyous Spring\n2x 14558127\nCalled by the Grave x2\nNibiru, the Primal Being');
    expect(parsed.entries.map((e) => ({ count: e.count, passcode: e.passcode, name: e.name }))).toEqual([
      { count: 3, passcode: null, name: 'Ash Blossom & Joyous Spring' },
      { count: 2, passcode: 14558127, name: null },
      { count: 2, passcode: null, name: 'Called by the Grave' },
      { count: 1, passcode: null, name: 'Nibiru, the Primal Being' },
    ]);
  });

  it('understands text section headers', () => {
    const parsed = parseDeckList('Main Deck:\n3 Ash Blossom & Joyous Spring\nExtra Deck (1)\n1 Accesscode Talker');
    expect(parsed.hasSections).toBe(true);
    expect(parsed.entries.map((e) => e.section)).toEqual(['main', 'extra']);
  });
});

describe('ydke links', () => {
  it('round-trips main/extra/side', () => {
    const deck = { main: [14558127, 14558127, 9674034], extra: [86066372], side: [23434538, 4294967295] };
    const parsed = parseYdke(toYdke(deck));
    const bySection = (s: string) => parsed.entries.filter((e) => e.section === s).map((e) => e.passcode);
    expect(bySection('main')).toEqual(deck.main);
    expect(bySection('extra')).toEqual(deck.extra);
    expect(bySection('side')).toEqual(deck.side);
  });

  it('is detected inside pasted text', () => {
    const link = toYdke({ main: [1, 2], extra: [], side: [] });
    const parsed = parseDeckList(`Hier mein Deck: ${link} viel Spaß`);
    expect(parsed.format).toBe('ydke');
    expect(parsed.entries.map((e) => e.passcode)).toEqual([1, 2]);
  });

  it('decodes a known link', () => {
    // 14558127 = 0x00DE23AF -> little-endian bytes AF 23 DE 00
    expect(toYdke({ main: [14558127], extra: [], side: [] })).toBe('ydke://ryPeAA==!!!');
  });
});

describe('ydkFileName', () => {
  it('removes characters that are not allowed in file names', () => {
    expect(ydkFileName('Snake/Eye: "Fire"')).toBe('Snake Eye Fire.ydk');
    expect(ydkFileName('   ')).toBe('deck.ydk');
  });
});
