/** Minimal card rules for live validation (subset of card-catalog). */

export type ManaMap = Record<string, number>;
export type TargetZone = 'land' | 'monster';
export type CardRarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';

export interface LiveCardRules {
  id: string;
  cardType: 'Land' | 'Monster' | 'Spell';
  /** Pack / collection rarity (matches client card-catalog). */
  rarity: CardRarity;
  /** Deck-construction weight (matches client card-catalog). */
  weight: number;
  manaCost?: ManaMap;
  space?: number;
  generateMana?: ManaMap;
  maxMana?: ManaMap;
  buildTime?: number;
  placeOnOpponentLandRow?: boolean;
  maxHealth?: number;
  attack?: number;
  multiAttack?: number;
  hasHaste?: boolean;
  startingBlocks?: number;
  cardElement?: string;
  attributes?: string[];
  monsterClass?: string;
  /** Spell fields */
  damage?: number;
  damageMultiplierAgainstZone?: Partial<Record<TargetZone, number>>;
  scaleDamageByTargetLandSpace?: boolean;
  allowedTargetZones?: TargetZone[];
  destroysTarget?: boolean;
}

export const LIVE_CARD_RULES: Record<string, LiveCardRules> = {
  'rock-monster': {
    id: 'rock-monster',
    cardType: 'Monster',
    rarity: 'Common',
    weight: 2,
    maxHealth: 80,
    attack: 10,
    cardElement: 'Rock',
    attributes: ['Melee'],
    monsterClass: 'Elemental',
  },
  'mighty-gopher': {
    id: 'mighty-gopher',
    cardType: 'Monster',
    rarity: 'Common',
    weight: 1,
    maxHealth: 50,
    attack: 20,
    cardElement: 'Rock',
    attributes: ['Melee'],
    monsterClass: 'Critter',
  },
  'boulder-toss': {
    id: 'boulder-toss',
    cardType: 'Spell',
    rarity: 'Common',
    weight: 2,
    manaCost: { Rock: 4 },
    damage: 60,
    damageMultiplierAgainstZone: { land: 2 },
    cardElement: 'Rock',
  },
  'mud-hut': {
    id: 'mud-hut',
    cardType: 'Land',
    rarity: 'Common',
    weight: 2,
    maxHealth: 80,
    buildTime: 0,
    space: 1,
    generateMana: { Rock: 1 },
    maxMana: { Rock: 5 },
    cardElement: 'Rock',
  },
  'mountain-range': {
    id: 'mountain-range',
    cardType: 'Land',
    rarity: 'Uncommon',
    weight: 5,
    manaCost: { Rock: 4 },
    maxHealth: 400,
    buildTime: 3,
    space: 3,
    generateMana: { Rock: 4, Ice: 3, Wind: 3, Mystic: 2, Grass: 2, Lightning: 2 },
    maxMana: { Rock: 15, Ice: 10, Wind: 10, Mystic: 5, Grass: 5, Lightning: 5 },
    cardElement: 'Rock',
  },
  'temple-of-being': {
    id: 'temple-of-being',
    cardType: 'Land',
    rarity: 'Uncommon',
    weight: 3,
    maxHealth: 100,
    buildTime: 2,
    space: 1,
    generateMana: { Rock: 2 },
    maxMana: { Rock: 6 },
    placeOnOpponentLandRow: true,
    cardElement: 'Rock',
  },
  armoredillo: {
    id: 'armoredillo',
    cardType: 'Monster',
    rarity: 'Common',
    weight: 1,
    maxHealth: 30,
    attack: 20,
    startingBlocks: 1,
    cardElement: 'Rock',
    attributes: ['Melee'],
    monsterClass: 'Critter',
  },
  ruptar: {
    id: 'ruptar',
    cardType: 'Monster',
    rarity: 'Uncommon',
    weight: 3,
    manaCost: { Rock: 4 },
    maxHealth: 120,
    attack: 30,
    multiAttack: 2,
    hasHaste: true,
    cardElement: 'Rock',
    attributes: ['Melee', 'Haste'],
    monsterClass: 'Dinosaur',
  },
  'elder-gopher-statue': {
    id: 'elder-gopher-statue',
    cardType: 'Land',
    rarity: 'Uncommon',
    weight: 3,
    maxHealth: 200,
    buildTime: 1,
    space: 1,
    generateMana: { Rock: 1 },
    maxMana: { Rock: 10 },
    cardElement: 'Rock',
  },
  rockterrior: {
    id: 'rockterrior',
    cardType: 'Monster',
    rarity: 'Rare',
    weight: 4,
    manaCost: { Rock: 8 },
    maxHealth: 180,
    attack: 30,
    cardElement: 'Rock',
    attributes: ['Melee'],
    monsterClass: 'Dinosaur',
  },
  'rock-slide': {
    id: 'rock-slide',
    cardType: 'Spell',
    rarity: 'Uncommon',
    weight: 4,
    manaCost: { Rock: 7 },
    damage: 100,
    allowedTargetZones: ['land'],
    scaleDamageByTargetLandSpace: true,
    cardElement: 'Rock',
  },
  'excavation-site': {
    id: 'excavation-site',
    cardType: 'Land',
    rarity: 'Rare',
    weight: 3,
    maxHealth: 160,
    buildTime: 2,
    space: 1,
    generateMana: { Rock: 2, Sand: 2 },
    maxMana: { Rock: 7, Sand: 7 },
    cardElement: 'Rock',
  },
  'earth-shatter': {
    id: 'earth-shatter',
    cardType: 'Spell',
    rarity: 'Epic',
    weight: 7,
    manaCost: { Rock: 12 },
    allowedTargetZones: ['land'],
    destroysTarget: true,
    cardElement: 'Rock',
  },
  '1000-mile-wall': {
    id: '1000-mile-wall',
    cardType: 'Land',
    rarity: 'Epic',
    weight: 8,
    manaCost: { Rock: 7 },
    maxHealth: 500,
    buildTime: 4,
    space: 5,
    generateMana: { Rock: 9 },
    maxMana: { Rock: 20 },
    cardElement: 'Rock',
  },
  'king-colossus': {
    id: 'king-colossus',
    cardType: 'Monster',
    rarity: 'Legendary',
    weight: 10,
    manaCost: { Rock: 15 },
    maxHealth: 200,
    attack: 50,
    cardElement: 'Rock',
    attributes: ['Melee'],
    monsterClass: 'Elemental',
  },
};

export function getLiveCardRules(cardId: string): LiveCardRules | undefined {
  return LIVE_CARD_RULES[cardId];
}

export function hasManaCost(cost: ManaMap | undefined): boolean {
  if (!cost) {
    return false;
  }
  return Object.values(cost).some((n) => n > 0);
}

export function canAffordMana(pool: ManaMap, cost: ManaMap | undefined): boolean {
  if (!cost || !hasManaCost(cost)) {
    return true;
  }
  for (const [el, amount] of Object.entries(cost)) {
    if ((pool[el] ?? 0) < amount) {
      return false;
    }
  }
  return true;
}

export function spendMana(pool: ManaMap, cost: ManaMap | undefined): ManaMap | null {
  if (!canAffordMana(pool, cost)) {
    return null;
  }
  if (!cost || !hasManaCost(cost)) {
    return { ...pool };
  }
  const next = { ...pool };
  for (const [el, amount] of Object.entries(cost)) {
    next[el] = (next[el] ?? 0) - amount;
    if (next[el] <= 0) {
      delete next[el];
    }
  }
  return next;
}

export function addManaCapped(
  pool: ManaMap,
  add: ManaMap | undefined,
  max: ManaMap | undefined,
): ManaMap {
  const merged = { ...pool };
  if (add) {
    for (const [el, amount] of Object.entries(add)) {
      merged[el] = (merged[el] ?? 0) + amount;
    }
  }
  return clampManaPoolToMax(merged, max ?? {});
}

/** Clamp every element in the pool to active land caps (missing cap → 0). */
export function clampManaPoolToMax(pool: ManaMap, maxMana: ManaMap): ManaMap {
  const out: ManaMap = {};
  for (const [element, amount] of Object.entries(pool)) {
    if (amount <= 0) {
      continue;
    }
    const cap = maxMana[element] ?? 0;
    const clamped = Math.min(amount, cap);
    if (clamped > 0) {
      out[element] = clamped;
    }
  }
  return out;
}

/** True while a land’s buildTime has not elapsed for the owning player. */
export function isLandStillBuilding(
  rules: LiveCardRules | undefined,
  placedAtOwnerTurnCounter: number,
  ownerTurnCounter: number,
): boolean {
  const buildTime = rules?.buildTime ?? 0;
  if (buildTime <= 0) {
    return false;
  }
  return placedAtOwnerTurnCounter + buildTime - ownerTurnCounter > 0;
}

export function spellAllowsTargetZone(
  rules: LiveCardRules | undefined,
  zone: TargetZone,
): boolean {
  if (!rules || rules.cardType !== 'Spell') {
    return false;
  }
  const allowed = rules.allowedTargetZones;
  if (!allowed || allowed.length === 0) {
    return true;
  }
  return allowed.includes(zone);
}

export function spellAllowsPlayerLifeTarget(rules: LiveCardRules | undefined): boolean {
  if (!rules || rules.cardType !== 'Spell') {
    return false;
  }
  const allowed = rules.allowedTargetZones;
  return !allowed || allowed.length === 0;
}
