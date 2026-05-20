/** Static definition for a card in the catalog (rules + display). Runtime battle state stays separate. */

/** Elemental keys → amount (mana produced, mana cost to play, etc.). */
export type ManaGenerationMap = Record<string, number>;

/** Mana required to play a card from hand (e.g. `{ Rock: 2 }`). */
export type ManaCostMap = ManaGenerationMap;

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
  /** Mana required to play from hand (e.g. `{ Rock: 2 }`). Omit when free. */
  manaCost?: ManaCostMap;
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
  /**
   * Land-only: how many of the owning player's turns after play before the land is active.
   * Activates at the start of the owner's turn when their turn counter reaches `placed + buildTime`.
   * `0` or omit for lands that work immediately.
   */
  buildTime?: number;
  /**
   * Land-only: must be dropped on the opponent's land row (not your own).
   * The card still belongs to the player who played it (mana, build timer).
   */
  placeOnOpponentLandRow?: boolean;
  /**
   * Land-only: footprint against the controller's land capacity (max 9 by default).
   * Omit or `0` when the land uses no capacity.
   */
  space?: number;
}

/** Human-readable label for UI (engine can use the raw map). */
export function formatManaGenerationMap(map: ManaGenerationMap): string {
  return Object.entries(map)
    .map(([element, amount]) => `${element}: ${amount}`)
    .join(', ');
}

/** True when a card has a non-zero mana cost to play. */
export function hasManaCost(cost: ManaCostMap | undefined): boolean {
  if (!cost) {
    return false;
  }
  return Object.values(cost).some((amount) => amount > 0);
}

/** Whether the player's mana pool satisfies every entry in `cost`. */
export function canAffordManaCost(pool: ManaGenerationMap, cost: ManaCostMap | undefined): boolean {
  if (!hasManaCost(cost)) {
    return true;
  }
  for (const [element, amount] of Object.entries(cost!)) {
    if (amount <= 0) {
      continue;
    }
    if ((pool[element] ?? 0) < amount) {
      return false;
    }
  }
  return true;
}

/** UI label for mana cost, or `null` when the card is free to play. */
export function formatManaCostForDisplay(cost: ManaCostMap | undefined): string | null {
  if (!hasManaCost(cost)) {
    return null;
  }
  return formatManaGenerationMap(cost!);
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
    manaCost: { Rock: 2 },
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
    maxHealth: 100,
    cardElement: 'Rock',
    rarity: 'Common',
    buildTime: 0,
    generateMana: {Rock: 1},
    space: 2,
    description: '',
  },
  'mighty-gopher': {
    id: 'mighty-gopher',
    name: 'Mighty Gopher',
    cardType: 'Monster',
    maxHealth: 50,
    attack: 10,
    defense: 20,
    cardElement: 'Rock',
    rarity: 'Common',
    monsterClass: 'Critter',
    attributes: ['Melee'],
    abilities: [{ id: 'burrow', name: 'Burrow', manaCost: 1, manaElement: 'Rock' }],
    description: 'Ability: Burrow (requires 1 Rock mana). Enter defense mode and become immune to spells.',
  },
  'mountain-range': {
    id: 'mountain-range',
    name: 'Mountain Range',
    cardType: 'Land',
    manaCost: { Rock: 2 },
    maxHealth: 250,
    cardElement: 'Rock',
    rarity: 'Uncommon',
    buildTime: 0,
    space: 4,
    generateMana: {Rock: 3, Ice: 3},
    description: 'Drains 1 Fire and Lightning mana from your opponent while active.',
  },
  'temple-of-being': {
    id: 'temple-of-being',
    name: 'Temple of Being',
    cardType: 'Land',
    maxHealth: 100,
    cardElement: 'Rock',
    rarity: 'Uncommon',
    buildTime: 1,
    space: 1,
    generateMana: {Rock: 2},
    placeOnOpponentLandRow: true,
    description: 'Can only be placed on the opponent\'s field if they have space available.',
  },
};

/** Land-only capacity footprint; `0` for non-lands or when unset. */
export function effectiveLandSpace(def: CardDefinition | undefined): number {
  if (!def || def.cardType !== 'Land') {
    return 0;
  }
  const space = def.space;
  if (space === undefined || space < 0) {
    return 0;
  }
  return space;
}

/** Land must be played on the opponent's land row (e.g. Temple of Being). */
export function mustPlaceLandOnOpponentRow(def: CardDefinition | undefined): boolean {
  return def?.placeOnOpponentLandRow === true;
}

/**
 * Whose land capacity this land uses on the field.
 * Normal lands: the controller who played them. Opponent-row lands (Temple): the row owner.
 */
export function landCapacityOwner(
  def: CardDefinition | undefined,
  controllerSlot: 'player1' | 'player2',
  rowSlot: 'player1' | 'player2',
): 'player1' | 'player2' {
  if (mustPlaceLandOnOpponentRow(def)) {
    return rowSlot;
  }
  return controllerSlot;
}

/** Whose land capacity to check before playing this land from hand. */
export function landCapacityOwnerForPlay(
  def: CardDefinition | undefined,
  playerPlayingFromHand: 'player1' | 'player2',
): 'player1' | 'player2' {
  if (mustPlaceLandOnOpponentRow(def)) {
    return playerPlayingFromHand === 'player1' ? 'player2' : 'player1';
  }
  return playerPlayingFromHand;
}

/** Whether a land dragged from `dragOwnerSlot` may enter `rowSlot`. */
export function isValidLandDropRow(
  def: CardDefinition | undefined,
  rowSlot: 'player1' | 'player2',
  dragOwnerSlot: 'player1' | 'player2',
): boolean {
  if (!def || def.cardType !== 'Land') {
    return false;
  }
  if (mustPlaceLandOnOpponentRow(def)) {
    return rowSlot !== dragOwnerSlot;
  }
  return rowSlot === dragOwnerSlot;
}

export function getCardDefinition(id: string): CardDefinition | undefined {
  return CARD_CATALOG[id];
}

/** Full turns after play before a land is active; `0` for non-lands or when unset. */
export function effectiveLandBuildTime(def: CardDefinition | undefined): number {
  if (!def || def.cardType !== 'Land') {
    return 0;
  }
  return def.buildTime ?? 0;
}

/**
 * Owner turns left before a land is active (`0` when ready or no build time).
 * At play: equals catalog `buildTime`; ticks down at the start of each of the owner’s turns.
 */
export function remainingLandBuildTurns(
  def: CardDefinition | undefined,
  placedAtOwnerTurnCounter: number,
  ownerTurnCounter: number,
): number {
  const buildTime = effectiveLandBuildTime(def);
  if (buildTime <= 0) {
    return 0;
  }
  return Math.max(0, placedAtOwnerTurnCounter + buildTime - ownerTurnCounter);
}

/**
 * True while a land’s `buildTime` has not elapsed for the owning player.
 * Activates at the start of the owner’s turn when `ownerTurnCounter >= placedAtOwnerTurn + buildTime`.
 */
export function isLandStillBuilding(
  def: CardDefinition | undefined,
  placedAtOwnerTurnCounter: number,
  ownerTurnCounter: number,
): boolean {
  return remainingLandBuildTurns(def, placedAtOwnerTurnCounter, ownerTurnCounter) > 0;
}

/** Land row data needed to sum mana only from activated lands. */
export interface FieldLandManaEntry {
  cardId: string;
  placedAtOwnerTurnCounter: number;
}

/**
 * Sums `generateMana` from field lands that have finished building.
 * Lands still within `buildTime` contribute nothing until activated.
 */
export function aggregateManaFromActiveFieldLands(
  lands: readonly FieldLandManaEntry[],
  ownerTurnCounter: number,
): ManaGenerationMap {
  const out: ManaGenerationMap = {};
  for (const entry of lands) {
    const def = getCardDefinition(entry.cardId);
    if (!def?.generateMana) {
      continue;
    }
    if (isLandStillBuilding(def, entry.placedAtOwnerTurnCounter, ownerTurnCounter)) {
      continue;
    }
    for (const [element, amount] of Object.entries(def.generateMana)) {
      out[element] = (out[element] ?? 0) + amount;
    }
  }
  return out;
}

/** Use in templates / routes so ids are not magic strings everywhere. */
export const CardIds = {
  rockMonster: 'rock-monster',
  mightyGopher: 'mighty-gopher',
  boulderToss: 'boulder-toss',
  mudHut: 'mud-hut',
  mountainRange: 'mountain-range',
  templeOfBeing: 'temple-of-being',
} as const;

/** Cards dealt from the top of the deck when a match starts (before any draw phase). */
export const OPENING_HAND_SIZE = 5;

/** Catalog ids allowed in a constructed deck (expand as you add cards). */
export const DECK_CARD_POOL: readonly string[] = [
  CardIds.rockMonster,
  CardIds.mightyGopher,
  CardIds.boulderToss,
  CardIds.mudHut,
  CardIds.mountainRange,
  CardIds.templeOfBeing,
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
