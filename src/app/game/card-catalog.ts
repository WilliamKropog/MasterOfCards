/** Static definition for a card in the catalog (rules + display). Runtime battle state stays separate. */

/** Land-only: elemental keys → amount produced (e.g. `{ Rock: 1, Water: 3 }`). */
export type ManaGenerationMap = Record<string, number>;

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
  /** Spells, abilities */
  manaCost?: number;
  /** Spell-only: damage dealt when this spell’s effect deals damage (omit for non-damage spells). */
  damage?: number;
  /** Land-only: mana produced per element when tapped / per rules. */
  generateMana?: ManaGenerationMap;
}

/** Human-readable label for UI (engine can use the raw map). */
export function formatManaGenerationMap(map: ManaGenerationMap): string {
  return Object.entries(map)
    .map(([element, amount]) => `${element}: ${amount}`)
    .join(', ');
}

export const CARD_CATALOG: Record<string, CardDefinition> = {
  'rock-monster': {
    id: 'rock-monster',
    name: 'Rock Monster',
    cardType: 'Monster',
    maxHealth: 80,
    attack: 10,
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
    description: 'Deal 60 damage to a target. If the target has the Flying attribute, deal 2x damage instead.',
  },
  'mud-hut': {
    id: 'mud-hut',
    name: 'Mud Hut',
    cardType: 'Land',
    manaCost: 0,
    maxHealth: 50,
    cardElement: 'Rock',
    rarity: 'Common',
    generateMana: {Rock: 1},
    description: '',
  },
};

export function getCardDefinition(id: string): CardDefinition | undefined {
  return CARD_CATALOG[id];
}

/** Use in templates / routes so ids are not magic strings everywhere. */
export const CardIds = {
  rockMonster: 'rock-monster',
  boulderToss: 'boulder-toss',
  mudHut: 'mud-hut',
} as const;

/** Default opening hand for local testing (same for both players). */
export const STARTER_HAND: string[] = [
  CardIds.rockMonster,
  CardIds.boulderToss,
  CardIds.mudHut,
];
