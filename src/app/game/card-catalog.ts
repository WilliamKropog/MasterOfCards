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
  /** Mana required to use the ability (spent from the player's turn pool). */
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
   * Monster-only: combat/ability tags (e.g. Melee, Haste, Taunt).
   * Haste: the monster is awake and may attack the turn it was played.
   * Omit or use `[]` when the monster has no special attributes.
   */
  attributes?: string[];
  /** Creatures, lands, etc. */
  maxHealth?: number;
  /** Combat power (creatures, weapons, etc.) — used for outgoing and counter damage in combat. */
  attack?: number;
  // /** Monster-only: retired — combat uses `attack` for all damage. */
  // defense?: number;
  /**
   * Monster-only: blocks granted when the monster enters the field.
   * Each block negates one incoming attack or spell (any damage amount).
   */
  startingBlocks?: number;
  /** Mana required to play from hand (e.g. `{ Rock: 2 }`). Omit when free. */
  manaCost?: ManaCostMap;
  /** Monster-only: activated abilities available while the monster is awake/ready. */
  abilities?: ActivatedAbilityDefinition[];
  /** Land-only: activated abilities (e.g. Elder Gopher Statue Praise). */
  landAbilities?: ActivatedAbilityDefinition[];
  /** Spell-only: damage dealt when this spell’s effect deals damage (omit for non-damage spells). */
  damage?: number;
  /**
   * Spell-only passive modifiers: multiply `damage` when targeting specific zones.
   * Example: `{ land: 2 }` doubles damage when the spell hits a land card.
   */
  damageMultiplierAgainstZone?: Partial<Record<TargetZone, number>>;
  /**
   * Spell-only: when true, multiply `damage` by the target land's `space`
   * (e.g. Rock Slide: 80 × 3 spaces = 240). Only applies when targeting a land.
   */
  scaleDamageByTargetLandSpace?: boolean;
  /**
   * Spell-only: restrict legal field targets to these zones.
   * Omit to allow both land and monster (and player LP via hand targeting).
   * Example: `['land']` for Rock Slide.
   */
  allowedTargetZones?: TargetZone[];
  /**
   * Spell-only: when true, destroy the tethered field card (set HP to 0 / remove)
   * instead of dealing catalog `damage`.
   */
  destroysTarget?: boolean;
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

/**
 * Deducts `cost` from `pool` when affordable. Returns a new pool, or `null` if any element is short.
 */
export function spendManaCost(
  pool: ManaGenerationMap,
  cost: ManaCostMap | undefined,
): ManaGenerationMap | null {
  if (!canAffordManaCost(pool, cost)) {
    return null;
  }
  if (!hasManaCost(cost)) {
    return { ...pool };
  }
  const next: ManaGenerationMap = { ...pool };
  for (const [element, amount] of Object.entries(cost!)) {
    if (amount <= 0) {
      continue;
    }
    const remaining = (next[element] ?? 0) - amount;
    if (remaining <= 0) {
      delete next[element];
    } else {
      next[element] = remaining;
    }
  }
  return next;
}

/** Adds `add` element amounts into a copy of `pool`. */
export function addManaToPool(pool: ManaGenerationMap, add: ManaGenerationMap): ManaGenerationMap {
  const next: ManaGenerationMap = { ...pool };
  for (const [element, amount] of Object.entries(add)) {
    if (amount > 0) {
      next[element] = (next[element] ?? 0) + amount;
    }
  }
  return next;
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
    maxHealth: 80,
    attack: 10,
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
    maxHealth: 80,
    cardElement: 'Rock',
    rarity: 'Common',
    buildTime: 0,
    generateMana: {Rock: 1},
    space: 1,
    description: 'A building that gets built and generates Rock mana instantly.',
  },
  'mighty-gopher': {
    id: 'mighty-gopher',
    name: 'Mighty Gopher',
    cardType: 'Monster',
    maxHealth: 50,
    attack: 20,
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
    maxHealth: 400,
    cardElement: 'Rock',
    rarity: 'Uncommon',
    buildTime: 3,
    space: 3,
    generateMana: {Rock: 4, Ice: 3, Wind: 3, Mystic: 2, Grass: 2, Lightning: 2},
    description: 'A mountainous region that generates lots of mana.',
  },
  'temple-of-being': {
    id: 'temple-of-being',
    name: 'Temple of Being',
    cardType: 'Land',
    maxHealth: 100,
    cardElement: 'Rock',
    rarity: 'Uncommon',
    buildTime: 2,
    space: 1,
    generateMana: {Rock: 2},
    placeOnOpponentLandRow: true,
    description: 'Can only be placed on the opponent\'s field if they have space available.',
  },
  'armoredillo': {
    id: 'armoredillo',
    name: 'Armoredillo',
    cardType: 'Monster',
    maxHealth: 30,
    attack: 20,
    cardElement: 'Rock',
    rarity: 'Common',
    monsterClass: 'Critter',
    attributes: ['Melee'],
    startingBlocks: 1,
    description: 'Starts with 1 shield when placed.',
  },
  'ruptar': {
    id: 'ruptar',
    name: 'Ruptar',
    cardType: 'Monster',
    manaCost: { Rock: 2 },
    maxHealth: 100,
    attack: 30,
    cardElement: 'Rock',
    rarity: 'Uncommon',
    monsterClass: 'Dinosaur',
    attributes: ['Melee', 'Haste'],
    description: 'Deals an additional +30 damage when attacking targets that are Lightning typed.',
  },
  'elder-gopher-statue': {
    id: 'elder-gopher-statue',
    name: 'Elder Gopher Statue',
    cardType: 'Land',
    maxHealth: 200,
    cardElement: 'Rock',
    rarity: 'Uncommon',
    buildTime: 1,
    space: 1,
    generateMana: {Rock: 1},
    landAbilities: [{ id: 'praise', name: 'Praise', manaCost: 0, manaElement: 'Rock' }],
    description: 'Elder Gopher Statue is powered by the Praises of the Mighty Gophers. Every time a Mighty Gopher Praises the Elder Gopher Statue, it generates an additional 1 Rock mana permanently. Consumes the turn of the Mighty Gopher.',
  },
  'rockterrior': {
    id: 'rockterrior',
    name: 'Rockterrior',
    cardType: 'Monster',
    manaCost: { Rock: 5 },
    maxHealth: 180,
    attack: 30,
    cardElement: 'Rock',
    rarity: 'Rare',
    monsterClass: 'Dinosaur',
    attributes: ['Melee'],
    abilities: [{ id: 'tail-smash', name: 'Tail Smash', manaCost: 3, manaElement: 'Rock' }],
    description: 'Tail Smash: Choose a target and deal 80 damage to it. If the target is an Ice type, deal 160 damage instead. Costs 3 Rock mana and is a one time use only.',
  },
  'rock-slide': {
    id: 'rock-slide',
    name: 'Rock Slide',
    cardType: 'Spell',
    manaCost: { Rock: 4 },
    cardElement: 'Rock',
    rarity: 'Uncommon',
    damage: 100,
    allowedTargetZones: ['land'],
    scaleDamageByTargetLandSpace: true,
    description: 'Deal 100 damage to any one land card. Deals multiplied damage for each space the target land card takes.',
  },
  'excavation-site': {
    id: 'excavation-site',
    name: 'Excavation Site',
    cardType: 'Land',
    maxHealth: 160,
    cardElement: 'Rock',
    rarity: 'Rare',
    buildTime: 2,
    space: 1,
    generateMana: {Rock: 2, Sand: 2},
    description: 'If a Dinosaur card is placed on this land and is killed, then place at the Dinosaur at the bottom of the player\'s deck instead of discarding it to the graveyard. One time use only.',
  },
  'earth-shatter': {
    id: 'earth-shatter',
    name: 'Earth Shatter',
    cardType: 'Spell',
    manaCost: { Rock: 8 },
    cardElement: 'Rock',
    rarity: 'Epic',
    allowedTargetZones: ['land'],
    destroysTarget: true,
    description: 'Select any one land card on your opponent\'s field and destroy it.',
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

/** Whether a spell may target the given field zone (defaults to both when unrestricted). */
export function spellAllowsTargetZone(
  def: CardDefinition | undefined,
  zone: TargetZone,
): boolean {
  if (!def || def.cardType !== 'Spell') {
    return false;
  }
  const allowed = def.allowedTargetZones;
  if (!allowed || allowed.length === 0) {
    return true;
  }
  return allowed.includes(zone);
}

/** Whether a spell may be cast at player life points (hand). Restricted spells cannot. */
export function spellAllowsPlayerLifeTarget(def: CardDefinition | undefined): boolean {
  if (!def || def.cardType !== 'Spell') {
    return false;
  }
  const allowed = def.allowedTargetZones;
  return !allowed || allowed.length === 0;
}

/** Monster-only: has the Haste attribute (awake and may attack the turn it was played). */
export function monsterHasHaste(def: CardDefinition | undefined): boolean {
  return def?.attributes?.includes('Haste') ?? false;
}

/**
 * True when a monster's summoning sickness has cleared for the current global turn.
 * Haste monsters are awake on the same turn they entered the field.
 */
export function monsterSummoningSicknessCleared(
  def: CardDefinition | undefined,
  placedAtTurnCounter: number,
  turnCounter: number,
): boolean {
  if (turnCounter > placedAtTurnCounter) {
    return true;
  }
  return turnCounter === placedAtTurnCounter && monsterHasHaste(def);
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
  /** Permanent Rock mana bonus from Praise activations. */
  praiseBonusRock?: number;
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
    const praiseRock = entry.praiseBonusRock ?? 0;
    if (praiseRock > 0) {
      out['Rock'] = (out['Rock'] ?? 0) + praiseRock;
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
  armoredillo: 'armoredillo',
  ruptar: 'ruptar',
  elderGopherStatue: 'elder-gopher-statue',
  rockterrior: 'rockterrior',
  rockSlide: 'rock-slide',
  excavationSite: 'excavation-site',
  earthShatter: 'earth-shatter',
} as const;

export function isElderGopherStatue(def: CardDefinition | undefined): boolean {
  return def?.id === CardIds.elderGopherStatue;
}

export function isExcavationSite(def: CardDefinition | undefined): boolean {
  return def?.id === CardIds.excavationSite;
}

/** Cards dealt from the top of the deck when a match starts (before any draw phase). */
export const OPENING_HAND_SIZE = 5;

/** Catalog ids allowed in a constructed deck (expand as you add cards). */
export const DECK_CARD_POOL: readonly string[] = [
  // CardIds.rockMonster,
  // CardIds.mightyGopher,
  // CardIds.boulderToss,
  CardIds.mudHut,
  CardIds.mountainRange,
  // CardIds.templeOfBeing,
  // CardIds.armoredillo,
  // CardIds.ruptar,
  // CardIds.mightyGopher,
  // CardIds.elderGopherStatue,
  // CardIds.rockterrior,
  // CardIds.rockSlide,
  // CardIds.excavationSite,
  CardIds.earthShatter,
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
