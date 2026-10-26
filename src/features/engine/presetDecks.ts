/**
 * Ready-made opponent decks for the AI. Classic cards with straightforward
 * effects; every passcode was checked against the EDOPro card database.
 */
export type PresetDeck = { id: string; name: string; description: string; main: number[]; extra: number[] };

const times = (code: number, n: number) => Array<number>(n).fill(code);

export const PRESET_DECKS: PresetDeck[] = [
  {
    id: 'preset-yugi',
    name: 'Klassik: Magier',
    description: 'Dunkler Magier, Magnet-Krieger und viele Fallen',
    main: [
      ...times(46986414, 3), // Dark Magician
      ...times(38033121, 2), // Dark Magician Girl
      73752131, // Skilled Dark Magician
      ...times(80304126, 2), // Magician's Valkyria
      71413901, // Breaker the Magical Warrior
      91152256, // Celtic Guardian
      ...times(6368038, 2), // Gaia The Fierce Knight
      ...times(70781052, 2), // Summoned Skull
      99785935, // Alpha The Magnet Warrior
      39256679, // Beta The Magnet Warrior
      11549357, // Gamma The Magnet Warrior
      75347539, // Valkyrion the Magna Warrior
      65240384, // Big Shield Gardna
      40640057, // Kuriboh
      83764718, // Monster Reborn
      53129443, // Dark Hole
      72302403, // Swords of Revealing Light
      ...times(5318639, 2), // Mystical Space Typhoon
      63391643, // Thousand Knives
      2314238, // Dark Magic Attack
      ...times(14087893, 2), // Book of Moon
      4031928, // Change of Heart
      44095762, // Mirror Force
      ...times(62279055, 2), // Magic Cylinder
      ...times(18807108, 2), // Spellbinding Circle
      ...times(4206964, 2), // Trap Hole
      ...times(56120475, 2), // Sakuretsu Armor
      70342110, // Dimensional Prison
    ],
    extra: [1861629, 41999284], // Decode Talker, Linkuriboh
  },
  {
    id: 'preset-kaiba',
    name: 'Klassik: Drachen',
    description: 'Weißer Drache mit eiskaltem Blick, Fusionen und harte Fallen',
    main: [
      ...times(89631139, 3), // Blue-Eyes White Dragon
      17985575, // Lord of D.
      34627841, // Kaibaman
      38517737, // Blue-Eyes Alternative White Dragon
      ...times(14898066, 2), // Vorse Raider
      ...times(97590747, 2), // La Jinn the Mystical Genie of the Lamp
      ...times(5053103, 2), // Battle Ox
      52824910, // Kaiser Glider
      ...times(39507162, 2), // Blade Knight
      66602787, // Saggi the Dark Clown
      62651957, // X-Head Cannon
      65622692, // Y-Dragon Head
      64500000, // Z-Metal Tank
      ...times(24094653, 2), // Polymerization
      43973174, // The Flute of Summoning Dragon
      83764718, // Monster Reborn
      12580477, // Raigeki
      ...times(55713623, 2), // Shrink
      ...times(98045062, 2), // Enemy Controller
      23265313, // Cost Down
      19613556, // Heavy Storm
      83555666, // Ring of Destruction
      57728570, // Crush Card Virus
      ...times(14315573, 2), // Negate Attack
      ...times(4206964, 2), // Trap Hole
      ...times(29401950, 2), // Bottomless Trap Hole
      53582587, // Torrential Tribute
      56120475, // Sakuretsu Armor
    ],
    extra: [23995346, 91998119, 2129638, 41999284], // Blue-Eyes Ultimate Dragon, XYZ-Dragon Cannon, Blue-Eyes Twin Burst Dragon, Linkuriboh
  },
];

export function presetDeck(id: string): PresetDeck | undefined {
  return PRESET_DECKS.find((d) => d.id === id);
}
