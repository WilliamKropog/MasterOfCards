/** Static definition for a card in the catalog (rules + display). Runtime battle state stays separate. */

/** Land-only: elemental keys → amount produced (e.g. `{ Rock: 1, Water: 3 }`). */
export type ManaGenerationMap = Record<string, number>;

/** Which zone a spell is targeting when tethered from hand. */
export type TargetZone = 'land' | 'monster';

export interface ActivatedAbilityDefinition {
  id: string;
  name: string;
  /** Mana required to use the ability (mana is not currently spent). */
  manaCost: number;
  manaElement: string;
}

export interface CardDefinition {
  id: string;
  name: string;
  cardType: string;
  /** Every card has an element, regardless of cardType. */
  cardElement: string;
  /** Every card has a rarity, regardless of cardType. */
  rarity: string;
  /** Rules / flavor text. Use `''` when there is nothing special to say. */
  description: string;
  /** Monster subtype (e.g. Elemental, Beast). Only meaningful for `cardType: 'Monster'`. */
  monsterClass?: string;
  /**
   * Monster-only: combat/ability tags (e.g. Melee, Taunt, Trample).
   * Omit or use `[]` when the monster has no special attributes.
   */
  attributes?: string[];
  /** Creatures, lands, etc. */
  maxHealth?: number;
  /** Combat power (creatures, weapons, etc.) */
  attack?: number;
  /** Monster-only: counter-damage while defending (and other defense-mode interactions). */
  defense?: number;
  /** Spells, abilities */
  manaCost?: number;
  /** Monster-only: activated abilities available while the monster is awake/ready. */
  abilities?: ActivatedAbilityDefinition[];
  /** Spell-only: damage dealt when this spell’s effect deals damage (omit for non-damage spells). */
  damage?: number;
  /**
   * Spell-only passive modifiers: multiply `damage` when targeting specific zones.
   * Example: `{ land: 2 }` doubles damage when the spell hits a land card.
   */
  damageMultiplierAgainstZone?: Partial<Record<TargetZone, number>>;
  /** Land-only: mana produced per element when tapped / per rules. */
  generateMana?: ManaGenerationMap;
}

/** Human-readable label for UI (engine can use the raw map). */
export function formatManaGenerationMap(map: ManaGenerationMap): string {
  return Object.entries(map)
    .map(([element, amount]) => `${element}: ${amount}`)
    .join(', ');
}

/**
 * Sums `generateMana` from each land card id (e.g. all lands on a player's field).
 * Multiple copies of the same land stack (three Mud Huts → Rock: 3).
 */
export function aggregateManaFromLandCardIds(cardIds: readonly string[]): ManaGenerationMap {
  const out: ManaGenerationMap = {};
  for (const id of cardIds) {
    const def = getCardDefinition(id);
    if (!def?.generateMana) {
      continue;
    }
    for (const [element, amount] of Object.entries(def.generateMana)) {
      out[element] = (out[element] ?? 0) + amount;
    }
  }
  return out;
}

export const CARD_CATALOG: Record<string, CardDefinition> = {
  'rock-monster': {
    id: 'rock-monster',
    name: 'Rock Monster',
    cardType: 'Monster',
    maxHealth: 60,
    attack: 10,
    defense: 30,
    manaCost: 0,
    cardElement: 'Rock',
    rarity: 'Common',
    monsterClass: 'Elemental',
    attributes: ['Melee'],
    description: '',
  },
  'boulder-toss': {
    id: 'boulder-toss',
    name: 'Boulder Toss',
    cardType: 'Spell',
    manaCost: 2,
    cardElement: 'Rock',
    rarity: 'Common',
    damage: 60,
    damageMultiplierAgainstZone: { land: 2 },
    description: 'Deals 60 damage to a target. If the target is a Land card, the damage is doubled.',
  },
  'mud-hut': {
    id: 'mud-hut',
    name: 'Mud Hut',
    cardType: 'Land',
    manaCost: 0,
    maxHealth: 100,
    cardElement: 'Rock',
    rarity: 'Common',
    generateMana: {Rock: 1},
    description: '',
  },
  'mighty-gopher': {
    id: 'mighty-gopher',
    name: 'Mighty Gopher',
    cardType: 'Monster',
    maxHealth: 50,
    attack: 10,
    defense: 20,
    manaCost: 0,
    cardElement: 'Rock',
    rarity: 'Common',
    monsterClass: 'Critter',
    attributes: ['Melee'],
    abilities: [{ id: 'burrow', name: 'Burrow', manaCost: 1, manaElement: 'Rock' }],
    description: 'Ability: Burrow (requires 1 Rock mana). Enter defense mode and become immune to spells.',
  },
};

export function getCardDefinition(id: string): CardDefinition | undefined {
  return CARD_CATALOG[id];
}

/** Use in templates / routes so ids are not magic strings everywhere. */
export const CardIds = {
  rockMonster: 'rock-monster',
  mightyGopher: 'mighty-gopher',
  boulderToss: 'boulder-toss',
  mudHut: 'mud-hut',
} as const;

/** Cards dealt from the top of the deck when a match starts (before any draw phase). */
export const OPENING_HAND_SIZE = 5;

/** Catalog ids allowed in a constructed deck (expand as you add cards). */
export const DECK_CARD_POOL: readonly string[] = [
  CardIds.rockMonster,
  CardIds.mightyGopher,
  CardIds.boulderToss,
  CardIds.mudHut,
];

export const DECK_SIZE = 25;

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = t;
  }
}

/**
 * Builds a face-down deck: `DECK_SIZE` random picks from `DECK_CARD_POOL`, then shuffled
 * so draw order is independent of pick order.
 */
export function buildShuffledDeck(): string[] {
  const deck: string[] = [];
  const pool = DECK_CARD_POOL;
  for (let i = 0; i < DECK_SIZE; i++) {
    deck.push(pool[Math.floor(Math.random() * pool.length)]!);
  }
  shuffleInPlace(deck);
  return deck;
}
